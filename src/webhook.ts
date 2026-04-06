import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { Bot } from "grammy";
import { BotContext } from "./context.js";
import { config } from "./config.js";
import { parseNotificationBody, verifyNotification } from "./payments/yoomoney.js";
import { getPaymentById, claimAndCreditPayment } from "./db/payments.js";
import { getUser } from "./db/users.js";
import { texts } from "./texts/index.js";

function getClientIp(req: IncomingMessage): string {
  if (config.webhookBaseUrl) {
    const forwarded = req.headers["x-forwarded-for"];
    if (forwarded) {
      const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded).split(",")[0].trim();
      if (first) return first;
    }
  }
  return req.socket.remoteAddress ?? "";
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
  if (!config.yoomoney.walletId || !config.yoomoney.notificationSecret) {
    console.log("YooMoney not configured, skipping webhook server");
    return;
  }

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (req.method === "POST" && req.url === "/webhooks/yoomoney") {
      const clientIp = getClientIp(req);
      try {
        const body = await readBody(req);
        const notification = parseNotificationBody(body);

        if (!notification) {
          console.warn("Invalid YooMoney notification from:", clientIp);
          res.writeHead(200);
          res.end("OK");
          return;
        }

        // Verify SHA1 hash
        if (!verifyNotification(notification, config.yoomoney.notificationSecret)) {
          console.warn("YooMoney notification hash mismatch from:", clientIp);
          res.writeHead(200);
          res.end("OK");
          return;
        }

        // Reject code-protected payments
        if (notification.codepro === "true") {
          console.warn("Code-protected payment rejected:", notification.operation_id);
          res.writeHead(200);
          res.end("OK");
          return;
        }

        // Only accept incoming payments
        if (notification.notification_type !== "p2p-incoming" && notification.notification_type !== "card-incoming") {
          console.warn("Unexpected notification type:", notification.notification_type);
          res.writeHead(200);
          res.end("OK");
          return;
        }

        // Verify currency is RUB (643)
        if (notification.currency !== "643") {
          console.warn("Unexpected currency:", notification.currency);
          res.writeHead(200);
          res.end("OK");
          return;
        }

        console.log("YooMoney notification:", notification.notification_type, "operation:", notification.operation_id, "label:", notification.label);

        // Find payment by label (= internal payment ID)
        const paymentId = Number(notification.label);
        if (!paymentId || isNaN(paymentId)) {
          console.error("Invalid payment label:", notification.label);
          res.writeHead(200);
          res.end("OK");
          return;
        }

        const payment = getPaymentById(paymentId);
        if (!payment) {
          console.error("Payment not found:", paymentId);
          res.writeHead(200);
          res.end("OK");
          return;
        }

        // Verify amount (YooMoney deducts ~3% commission, so received < expected is normal)
        // Reject only if received amount is less than 90% of expected (protects against label spoofing)
        const expectedRub = payment.amount / 100;
        const receivedRub = parseFloat(notification.amount);
        if (isNaN(receivedRub) || receivedRub < expectedRub * 0.9) {
          console.warn("Amount mismatch: expected", expectedRub, "RUB, received", receivedRub, "RUB, payment:", paymentId);
          res.writeHead(200);
          res.end("OK");
          return;
        }

        // Atomic claim + credit
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
        res.writeHead(200);
        res.end("OK");
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
