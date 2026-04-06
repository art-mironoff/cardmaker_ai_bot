import { createHash, timingSafeEqual } from "crypto";
import { config } from "../config.js";

const QUICKPAY_URL = "https://yoomoney.ru/quickpay/confirm";

/**
 * Build a YooMoney quickpay payment URL.
 * No API call needed — just URL with query parameters.
 */
export function buildPaymentUrl(amountRub: number, paymentId: number): string {
  const params = new URLSearchParams({
    receiver: config.yoomoney.walletId,
    "quickpay-form": "shop",
    paymentType: "AC",
    sum: amountRub.toFixed(2),
    label: String(paymentId),
    successURL: config.yoomoney.returnUrl,
  });

  return `${QUICKPAY_URL}?${params.toString()}`;
}

export interface YooMoneyNotification {
  notification_type: string;
  operation_id: string;
  amount: string;
  currency: string;
  datetime: string;
  sender: string;
  codepro: string;
  label: string;
  sha1_hash: string;
}

/**
 * Parse URL-encoded webhook body into notification object.
 */
export function parseNotificationBody(body: string): YooMoneyNotification | null {
  try {
    const params = new URLSearchParams(body);
    const required = [
      "notification_type", "operation_id", "amount",
      "currency", "datetime", "sender", "codepro", "label", "sha1_hash",
    ];

    for (const key of required) {
      if (!params.has(key)) return null;
    }

    return {
      notification_type: params.get("notification_type")!,
      operation_id: params.get("operation_id")!,
      amount: params.get("amount")!,
      currency: params.get("currency")!,
      datetime: params.get("datetime")!,
      sender: params.get("sender")!,
      codepro: params.get("codepro")!,
      label: params.get("label")!,
      sha1_hash: params.get("sha1_hash")!,
    };
  } catch {
    return null;
  }
}

/**
 * Verify YooMoney notification SHA1 hash.
 * Hash = SHA1(notification_type&operation_id&amount&currency&datetime&sender&codepro&notification_secret&label)
 */
export function verifyNotification(notification: YooMoneyNotification, secret: string): boolean {
  const str = [
    notification.notification_type,
    notification.operation_id,
    notification.amount,
    notification.currency,
    notification.datetime,
    notification.sender,
    notification.codepro,
    secret,
    notification.label,
  ].join("&");

  const expected = createHash("sha1").update(str).digest("hex");
  if (expected.length !== notification.sha1_hash.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(notification.sha1_hash));
}
