import { describe, it, expect, vi } from "vitest";
import { createHash } from "crypto";

vi.mock("../../src/config.js", () => ({
  config: {
    yoomoney: {
      walletId: "4100000000000",
      notificationSecret: "test_secret_key",
      returnUrl: "https://t.me/testbot",
    },
  },
}));

const { buildPaymentUrl, parseNotificationBody, verifyNotification } =
  await import("../../src/payments/yoomoney.js");

describe("payments/yoomoney", () => {
  describe("buildPaymentUrl", () => {
    it("builds URL with correct parameters", () => {
      const url = buildPaymentUrl(100, 42);
      expect(url).toContain("https://yoomoney.ru/quickpay/confirm?");
      expect(url).toContain("receiver=4100000000000");
      expect(url).toContain("quickpay-form=shop");
      expect(url).toContain("paymentType=AC");
      expect(url).toContain("sum=100.00");
      expect(url).toContain("label=42");
      expect(url).toContain("successURL=https%3A%2F%2Ft.me%2Ftestbot");
    });

    it("formats amount with 2 decimal places", () => {
      const url = buildPaymentUrl(50, 1);
      expect(url).toContain("sum=50.00");
    });

    it("handles fractional amounts", () => {
      const url = buildPaymentUrl(99.99, 1);
      expect(url).toContain("sum=99.99");
    });
  });

  describe("parseNotificationBody", () => {
    function buildBody(overrides: Record<string, string> = {}): string {
      const params = new URLSearchParams({
        notification_type: "p2p-incoming",
        operation_id: "op_123",
        amount: "100.00",
        currency: "643",
        datetime: "2024-01-01T12:00:00Z",
        sender: "41001234567890",
        codepro: "false",
        label: "42",
        sha1_hash: "abc123",
        ...overrides,
      });
      return params.toString();
    }

    it("parses valid notification body", () => {
      const result = parseNotificationBody(buildBody());
      expect(result).not.toBeNull();
      expect(result!.notification_type).toBe("p2p-incoming");
      expect(result!.operation_id).toBe("op_123");
      expect(result!.amount).toBe("100.00");
      expect(result!.currency).toBe("643");
      expect(result!.sender).toBe("41001234567890");
      expect(result!.codepro).toBe("false");
      expect(result!.label).toBe("42");
    });

    it("returns null when required field is missing", () => {
      const body = new URLSearchParams({
        notification_type: "p2p-incoming",
        operation_id: "op_123",
        // missing amount and other fields
      }).toString();
      expect(parseNotificationBody(body)).toBeNull();
    });

    it("returns null for each missing required field", () => {
      const required = [
        "notification_type", "operation_id", "amount",
        "currency", "datetime", "sender", "codepro", "label", "sha1_hash",
      ];

      for (const field of required) {
        const params: Record<string, string> = {};
        for (const f of required) {
          if (f !== field) params[f] = "test";
        }
        const body = new URLSearchParams(params).toString();
        expect(parseNotificationBody(body)).toBeNull();
      }
    });

    it("returns null for empty body", () => {
      expect(parseNotificationBody("")).toBeNull();
    });
  });

  describe("verifyNotification", () => {
    function makeNotification(secret: string) {
      const notification = {
        notification_type: "p2p-incoming",
        operation_id: "op_123",
        amount: "100.00",
        currency: "643",
        datetime: "2024-01-01T12:00:00Z",
        sender: "41001234567890",
        codepro: "false",
        label: "42",
        sha1_hash: "",
      };

      // Compute correct hash
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
      notification.sha1_hash = createHash("sha1").update(str).digest("hex");

      return notification;
    }

    it("returns true for valid hash", () => {
      const notification = makeNotification("test_secret");
      expect(verifyNotification(notification, "test_secret")).toBe(true);
    });

    it("returns false for wrong secret", () => {
      const notification = makeNotification("correct_secret");
      expect(verifyNotification(notification, "wrong_secret")).toBe(false);
    });

    it("returns false for tampered amount", () => {
      const notification = makeNotification("test_secret");
      notification.amount = "999.99";
      expect(verifyNotification(notification, "test_secret")).toBe(false);
    });

    it("returns false for tampered label", () => {
      const notification = makeNotification("test_secret");
      notification.label = "999";
      expect(verifyNotification(notification, "test_secret")).toBe(false);
    });

    it("returns false for completely wrong hash", () => {
      const notification = makeNotification("test_secret");
      notification.sha1_hash = "0000000000000000000000000000000000000000";
      expect(verifyNotification(notification, "test_secret")).toBe(false);
    });

    it("returns false for hash with different length", () => {
      const notification = makeNotification("test_secret");
      notification.sha1_hash = "short";
      expect(verifyNotification(notification, "test_secret")).toBe(false);
    });
  });
});
