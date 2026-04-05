import { config } from "../config.js";
import { createHash } from "crypto";

const BASE_URL = "https://api.yookassa.ru/v3";

interface YooKassaAmount {
  value: string;
  currency: string;
}

interface YooKassaPayment {
  id: string;
  status: string;
  amount: YooKassaAmount;
  confirmation?: {
    type: string;
    confirmation_url: string;
  };
  metadata?: Record<string, string>;
}

function getAuthHeader(): string {
  const credentials = `${config.yookassa.shopId}:${config.yookassa.secretKey}`;
  return `Basic ${Buffer.from(credentials).toString("base64")}`;
}

export async function createYooKassaPayment(
  amountRub: number,
  paymentId: number,
  userId: number,
): Promise<{ id: string; confirmationUrl: string }> {
  const response = await fetch(`${BASE_URL}/payments`, {
    method: "POST",
    signal: AbortSignal.timeout(15_000),
    headers: {
      "Authorization": getAuthHeader(),
      "Content-Type": "application/json",
      "Idempotence-Key": createHash("sha256").update(`payment:${paymentId}`).digest("hex"),
    },
    body: JSON.stringify({
      amount: {
        value: amountRub.toFixed(2),
        currency: "RUB",
      },
      confirmation: {
        type: "redirect",
        return_url: config.yookassa.returnUrl,
      },
      capture: true,
      metadata: {
        payment_id: String(paymentId),
        user_id: String(userId),
      },
      description: `Пополнение баланса на ${amountRub} ₽`,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    console.error("YooKassa API error response:", response.status, body);
    throw new Error(`YooKassa API error: ${response.status}`);
  }

  const payment = (await response.json()) as YooKassaPayment;

  if (!payment.confirmation?.confirmation_url) {
    throw new Error("YooKassa did not return confirmation URL");
  }

  return {
    id: payment.id,
    confirmationUrl: payment.confirmation.confirmation_url,
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getYooKassaPayment(paymentId: string): Promise<YooKassaPayment> {
  if (!UUID_RE.test(paymentId)) {
    throw new Error("Invalid YooKassa payment ID format");
  }
  const response = await fetch(`${BASE_URL}/payments/${paymentId}`, {
    signal: AbortSignal.timeout(15_000),
    headers: {
      "Authorization": getAuthHeader(),
    },
  });

  if (!response.ok) {
    throw new Error(`YooKassa API error: ${response.status}`);
  }

  return (await response.json()) as YooKassaPayment;
}

export interface WebhookEvent {
  type: string;
  event: string;
  object: YooKassaPayment;
}

export function parseWebhookBody(body: string): WebhookEvent | null {
  try {
    const data = JSON.parse(body) as WebhookEvent;
    if (data.event === "payment.succeeded" && data.object) {
      return data;
    }
    return null;
  } catch {
    return null;
  }
}
