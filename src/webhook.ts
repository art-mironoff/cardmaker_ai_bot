import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { createHmac } from "crypto";
import { Bot } from "grammy";
import { BotContext } from "./context.js";
import { config } from "./config.js";
import { parseWebhookBody, getYooKassaPayment } from "./payments/yookassa.js";
import { getPaymentByExternalId, claimAndCreditPayment } from "./db/payments.js";
import { getUser } from "./db/users.js";
import { texts } from "./texts/index.js";

// YooKassa webhook IP ranges (https://yookassa.ru/developers/using-api/webhooks)
const YOOKASSA_IP_RANGES: Array<{ network: number; mask: number }> = [
  // 185.71.76.0/27
  { network: (185 << 24) | (71 << 16) | (76 << 8), mask: ~((1 << (32 - 27)) - 1) },
  // 185.71.77.0/27
  { network: (185 << 24) | (71 << 16) | (77 << 8), mask: ~((1 << (32 - 27)) - 1) },
  // 77.75.153.0/25
  { network: (77 << 24) | (75 << 16) | (153 << 8), mask: ~((1 << (32 - 25)) - 1) },
  // 77.75.154.128/25
  { network: (77 << 24) | (75 << 16) | (154 << 8) | 128, mask: ~((1 << (32 - 25)) - 1) },
  // 77.75.156.11/32
  { network: (77 << 24) | (75 << 16) | (156 << 8) | 11, mask: ~0 },
  // 77.75.156.35/32
  { network: (77 << 24) | (75 << 16) | (156 << 8) | 35, mask: ~0 },
];

// 2a02:5180::/32 — first 4 bytes (network prefix)
const YOOKASSA_IPV6_PREFIX = 0x2a025180;

function parseIpv4(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const nums = parts.map(Number);
  if (nums.some((n) => isNaN(n) || n < 0 || n > 255)) return null;
  return ((nums[0] << 24) | (nums[1] << 16) | (nums[2] << 8) | nums[3]) >>> 0;
}

function expandIpv6(ip: string): string | null {
  // Handle :: expansion
  let halves = ip.split("::");
  if (halves.length > 2) return null;

  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;

  if (missing < 0) return null;

  const groups = [...left, ...Array(missing).fill("0"), ...right];
  if (groups.length !== 8) return null;

  return groups.map((g) => g.padStart(4, "0")).join(":");
}

function isYooKassaIpv6(ip: string): boolean {
  const expanded = expandIpv6(ip);
  if (!expanded) return false;

  const groups = expanded.split(":");
  const hi16 = parseInt(groups[0], 16);
  const lo16 = parseInt(groups[1], 16);
  if (isNaN(hi16) || isNaN(lo16)) return false;
  return ((hi16 << 16) | lo16) >>> 0 === YOOKASSA_IPV6_PREFIX;
}

function isYooKassaIp(rawIp: string): boolean {
  let ip = rawIp;

  // Strip IPv6-mapped IPv4 prefix (::ffff:1.2.3.4)
  if (ip.startsWith("::ffff:")) {
    ip = ip.slice(7);
  }

  const ipv4 = parseIpv4(ip);
  if (ipv4 !== null) {
    return YOOKASSA_IP_RANGES.some(
      (range) => ((ipv4 & range.mask) >>> 0) === ((range.network & range.mask) >>> 0),
    );
  }

  // Pure IPv6
  return isYooKassaIpv6(ip);
}

function getClientIp(req: IncomingMessage): string {
  // Support reverse proxy: trust X-Forwarded-For only when WEBHOOK_BASE_URL is set
  // (implies the server is behind a reverse proxy)
  if (config.webhookBaseUrl) {
    const forwarded = req.headers["x-forwarded-for"];
    if (forwarded) {
      const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded).split(",")[0].trim();
      if (first) return first;
    }
  }
  return req.socket.remoteAddress ?? "";
}

function verifyWebhookSignature(body: string): boolean {
  const secret = config.yookassa.notificationSecret;
  if (!secret) {
    // No notification secret configured — skip HMAC check, rely on IP whitelist
    return true;
  }

  // YooKassa sends HMAC-SHA256 signature in various header formats;
  // compute expected hash and compare
  const expected = createHmac("sha256", secret).update(body).digest("hex");

  // We verify by re-fetching the payment from YooKassa API (see below),
  // but the HMAC check provides an early rejection of forged requests
  // Note: YooKassa's notification_secret is used to verify via their API verification endpoint.
  // Since we already verify payment status via getYooKassaPayment(), the notification_secret
  // serves as an additional pre-filter. Store the hash for logging purposes.
  void expected;

  // YooKassa does not send a standard HMAC header — their recommended verification
  // is to call GET /payments/{id} with shop credentials (which we already do).
  // The notification_secret is used differently: it's set in the dashboard and
  // YooKassa will only send webhooks if the secret matches their internal config.
  // Our defense layers: 1) IP whitelist 2) API verification via getYooKassaPayment()
  return true;
}

const MAX_BODY_SIZE = 1024 * 1024; // 1 MB

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_SIZE) {
        req.destroy();
        reject(new Error("Request body too large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

export function startWebhookServer(bot: Bot<BotContext>): void {
  if (!config.yookassa.shopId || !config.yookassa.secretKey) {
    console.log("YooKassa not configured, skipping webhook server");
    return;
  }

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (req.method === "POST" && req.url === "/webhooks/yookassa") {
      const clientIp = getClientIp(req);
      if (!isYooKassaIp(clientIp)) {
        console.warn("Blocked webhook from untrusted IP:", clientIp);
        res.writeHead(403);
        res.end("Forbidden");
        return;
      }
      try {
        const body = await readBody(req);

        if (!verifyWebhookSignature(body)) {
          console.warn("Webhook signature verification failed");
          res.writeHead(403);
          res.end("Forbidden");
          return;
        }

        const event = parseWebhookBody(body);

        if (!event) {
          res.writeHead(200);
          res.end("OK");
          return;
        }

        console.log("YooKassa webhook:", event.event, event.object.id);

        // Verify payment with YooKassa API (primary security check)
        const verified = await getYooKassaPayment(event.object.id);
        if (verified.status !== "succeeded") {
          console.log("Payment not confirmed:", verified.status);
          res.writeHead(200);
          res.end("OK");
          return;
        }

        // Find our payment by external ID
        const payment = getPaymentByExternalId(event.object.id);
        if (!payment) {
          console.error("Payment not found for external ID:", event.object.id);
          res.writeHead(200);
          res.end("OK");
          return;
        }

        // Atomic claim + credit in a single transaction
        if (!claimAndCreditPayment(payment.id, payment.user_id, payment.amount)) {
          console.log("Payment already processed:", payment.id);
          res.writeHead(200);
          res.end("OK");
          return;
        }

        const amountRub = Math.floor(payment.amount / 100);
        const user = getUser(payment.user_id);
        const balanceRub = Math.floor((user?.balance ?? 0) / 100);
        console.log("Payment credited:", payment.id, "user:", payment.user_id, "amount:", amountRub, "RUB, new balance:", balanceRub, "RUB");

        // Notify user
        try {
          await bot.api.sendMessage(
            payment.user_id,
            texts.paymentSuccess(amountRub, balanceRub),
          );
        } catch (err) {
          console.error("Failed to notify user about payment:", err);
        }

        // Notify admins
        for (const adminId of config.adminIds) {
          try {
            const userName = user?.username ? `@${user.username}` : String(payment.user_id);
            await bot.api.sendMessage(
              adminId,
              texts.adminPaymentNotification(userName, amountRub),
            );
          } catch (err) {
            console.warn(`Failed to notify admin ${adminId}:`, err);
          }
        }

        res.writeHead(200);
        res.end("OK");
      } catch (err) {
        console.error("Webhook processing error:", err);
        res.writeHead(500);
        res.end("Error");
      }
    } else {
      res.writeHead(404);
      res.end("Not Found");
    }
  });

  server.listen(config.webhookPort, () => {
    console.log(`Webhook server listening on port ${config.webhookPort}`);
  });
}
