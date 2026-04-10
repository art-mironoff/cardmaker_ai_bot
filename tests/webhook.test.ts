import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import type { IncomingMessage, ServerResponse } from "http";
import { createHash } from "crypto";
import type { YooMoneyNotification } from "../src/payments/yoomoney.js";

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockConfig = {
  yoomoney: {
    walletId: "test-wallet",
    notificationSecret: "test-secret",
    returnUrl: "",
  },
  webhookPort: 0,
  webhookBaseUrl: "",
  adminIds: [] as number[],
};

vi.mock("../src/config.js", () => ({
  config: mockConfig,
}));

const mockParseNotificationBody = vi.fn<(body: string) => YooMoneyNotification | null>();
const mockVerifyNotification = vi.fn<(n: YooMoneyNotification, s: string) => boolean>();

vi.mock("../src/payments/yoomoney.js", () => ({
  parseNotificationBody: (...args: Parameters<typeof mockParseNotificationBody>) =>
    mockParseNotificationBody(...args),
  verifyNotification: (...args: Parameters<typeof mockVerifyNotification>) =>
    mockVerifyNotification(...args),
}));

const mockGetPaymentById = vi.fn<(id: number) => unknown>();
const mockClaimAndCreditPayment = vi.fn<(id: number, userId: number, amount: number) => boolean>();

vi.mock("../src/db/payments.js", () => ({
  getPaymentById: (...args: Parameters<typeof mockGetPaymentById>) =>
    mockGetPaymentById(...args),
  claimAndCreditPayment: (...args: Parameters<typeof mockClaimAndCreditPayment>) =>
    mockClaimAndCreditPayment(...args),
}));

const mockGetUser = vi.fn<(id: number) => unknown>();

vi.mock("../src/db/users.js", () => ({
  getUser: (...args: Parameters<typeof mockGetUser>) => mockGetUser(...args),
}));

vi.mock("../src/texts/index.js", () => ({
  texts: {
    paymentSuccess: (amount: number, balance: number) =>
      `Payment: ${amount} RUB, balance: ${balance} RUB`,
    adminPaymentNotification: (userName: string, amountRub: number) =>
      `Admin: ${userName} paid ${amountRub} RUB`,
  },
}));

// Capture the HTTP request handler from createServer
let requestHandler: (req: IncomingMessage, res: ServerResponse) => void;

vi.mock("http", () => ({
  createServer: vi.fn((handler: (req: IncomingMessage, res: ServerResponse) => void) => {
    requestHandler = handler;
    return { listen: vi.fn((_port: number, cb?: () => void) => cb?.()) };
  }),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

const SECRET = "test-secret";

function makeNotification(overrides: Partial<YooMoneyNotification> = {}): YooMoneyNotification {
  const base: Omit<YooMoneyNotification, "sha1_hash"> = {
    notification_type: "p2p-incoming",
    operation_id: "op_test_123",
    amount: "100.00",
    currency: "643",
    datetime: "2025-01-15T12:00:00Z",
    sender: "41001234567890",
    codepro: "false",
    label: "1",
    ...overrides,
  };

  const hashStr = [
    base.notification_type,
    base.operation_id,
    base.amount,
    base.currency,
    base.datetime,
    base.sender,
    base.codepro,
    SECRET,
    base.label,
  ].join("&");

  return {
    ...base,
    sha1_hash: overrides.sha1_hash ?? createHash("sha1").update(hashStr).digest("hex"),
  };
}

function buildUrlEncodedBody(notification: YooMoneyNotification): string {
  return new URLSearchParams(notification as unknown as Record<string, string>).toString();
}

/**
 * Create a mock IncomingMessage that emits the given body.
 */
function createMockReq(
  method: string,
  url: string,
  body = "",
): IncomingMessage {
  const { EventEmitter } = require("events");
  const req = new EventEmitter() as IncomingMessage;
  req.method = method;
  req.url = url;
  req.headers = {};
  req.socket = { remoteAddress: "127.0.0.1" } as IncomingMessage["socket"];

  // Emit body data asynchronously
  process.nextTick(() => {
    if (body) {
      req.emit("data", Buffer.from(body));
    }
    req.emit("end");
  });

  return req;
}

/**
 * Create a mock ServerResponse that captures writeHead and end calls.
 */
function createMockRes(): ServerResponse & { statusCode: number; body: string } {
  const res = {
    statusCode: 0,
    body: "",
    writeHead: vi.fn(function (this: { statusCode: number }, code: number) {
      this.statusCode = code;
    }),
    end: vi.fn(function (this: { body: string }, data?: string) {
      this.body = data ?? "";
    }),
  } as unknown as ServerResponse & { statusCode: number; body: string };
  return res;
}

/**
 * Invoke the captured request handler and wait for the response to complete.
 */
async function sendRequest(
  method: string,
  url: string,
  body = "",
): Promise<{ statusCode: number; body: string }> {
  const req = createMockReq(method, url, body);
  const res = createMockRes();
  await requestHandler(req, res);
  // Wait for async response processing
  await new Promise((r) => setTimeout(r, 10));
  return { statusCode: res.statusCode, body: res.body };
}

// ── Mock bot ─────────────────────────────────────────────────────────────────

const mockSendMessage = vi.fn().mockResolvedValue({});
const mockBot = {
  api: {
    sendMessage: mockSendMessage,
  },
} as unknown;

// ── Setup ────────────────────────────────────────────────────────────────────

let startWebhookServer: typeof import("../src/webhook.js")["startWebhookServer"];

beforeAll(async () => {
  const mod = await import("../src/webhook.js");
  startWebhookServer = mod.startWebhookServer;
  // Start the webhook server (captured via mock http.createServer)
  startWebhookServer(mockBot as import("grammy").Bot<import("../src/context.js").BotContext>);
});

beforeEach(() => {
  mockParseNotificationBody.mockReset();
  mockVerifyNotification.mockReset();
  mockGetPaymentById.mockReset();
  mockClaimAndCreditPayment.mockReset();
  mockGetUser.mockReset();
  mockSendMessage.mockReset();
  mockConfig.adminIds = [];
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("webhook server", () => {
  it("returns 200 OK on valid notification", async () => {
    const notification = makeNotification();

    mockParseNotificationBody.mockReturnValue(notification);
    mockVerifyNotification.mockReturnValue(true);
    mockGetPaymentById.mockReturnValue({
      id: 1,
      user_id: 100,
      amount: 10000,
      status: "pending",
    });
    mockClaimAndCreditPayment.mockReturnValue(true);
    mockGetUser.mockReturnValue({
      telegram_id: 100,
      username: "testuser",
      balance: 20000,
    });

    const body = buildUrlEncodedBody(notification);
    const res = await sendRequest("POST", "/webhooks/yoomoney", body);

    expect(res.statusCode).toBe(200);
    expect(res.body).toBe("OK");
    expect(mockClaimAndCreditPayment).toHaveBeenCalledWith(1, 100, 10000);
    expect(mockSendMessage).toHaveBeenCalledWith(
      100,
      expect.stringContaining("100"),
    );
  });

  it("returns 200 OK even on processing error (no retry)", async () => {
    mockParseNotificationBody.mockImplementation(() => {
      throw new Error("Unexpected parsing error");
    });

    const res = await sendRequest("POST", "/webhooks/yoomoney", "bad=data");

    expect(res.statusCode).toBe(200);
    expect(res.body).toBe("OK");
  });

  it("returns 404 on unknown path", async () => {
    const res = await sendRequest("POST", "/unknown");

    expect(res.statusCode).toBe(404);
    expect(res.body).toBe("Not Found");
  });

  it("rejects invalid SHA1 signature", async () => {
    const notification = makeNotification({ sha1_hash: "invalid_hash" });

    mockParseNotificationBody.mockReturnValue(notification);
    mockVerifyNotification.mockReturnValue(false);

    const body = buildUrlEncodedBody(notification);
    const res = await sendRequest("POST", "/webhooks/yoomoney", body);

    expect(res.statusCode).toBe(200);
    expect(res.body).toBe("OK");
    expect(mockGetPaymentById).not.toHaveBeenCalled();
    expect(mockClaimAndCreditPayment).not.toHaveBeenCalled();
  });

  it("rejects codepro=true", async () => {
    const notification = makeNotification({ codepro: "true" });

    mockParseNotificationBody.mockReturnValue(notification);
    mockVerifyNotification.mockReturnValue(true);

    const body = buildUrlEncodedBody(notification);
    const res = await sendRequest("POST", "/webhooks/yoomoney", body);

    expect(res.statusCode).toBe(200);
    expect(res.body).toBe("OK");
    expect(mockGetPaymentById).not.toHaveBeenCalled();
  });

  it("rejects unsupported notification_type", async () => {
    const notification = makeNotification({ notification_type: "outgoing" });

    mockParseNotificationBody.mockReturnValue(notification);
    mockVerifyNotification.mockReturnValue(true);

    const body = buildUrlEncodedBody(notification);
    const res = await sendRequest("POST", "/webhooks/yoomoney", body);

    expect(res.statusCode).toBe(200);
    expect(res.body).toBe("OK");
    expect(mockGetPaymentById).not.toHaveBeenCalled();
  });

  it("rejects currency != 643 (not RUB)", async () => {
    const notification = makeNotification({ currency: "840" });

    mockParseNotificationBody.mockReturnValue(notification);
    mockVerifyNotification.mockReturnValue(true);

    const body = buildUrlEncodedBody(notification);
    const res = await sendRequest("POST", "/webhooks/yoomoney", body);

    expect(res.statusCode).toBe(200);
    expect(res.body).toBe("OK");
    expect(mockGetPaymentById).not.toHaveBeenCalled();
  });

  it("rejects amount < 90% of expected (commission > 10%)", async () => {
    const notification = makeNotification({ amount: "80.00" });

    mockParseNotificationBody.mockReturnValue(notification);
    mockVerifyNotification.mockReturnValue(true);
    mockGetPaymentById.mockReturnValue({
      id: 1,
      user_id: 100,
      amount: 10000, // 100 RUB expected
      status: "pending",
    });

    const body = buildUrlEncodedBody(notification);
    const res = await sendRequest("POST", "/webhooks/yoomoney", body);

    expect(res.statusCode).toBe(200);
    expect(res.body).toBe("OK");
    // 80 < 100 * 0.9 = 90, so should be rejected
    expect(mockClaimAndCreditPayment).not.toHaveBeenCalled();
  });

  it("accepts amount >= 90% of expected", async () => {
    const notification = makeNotification({ amount: "91.00" });

    mockParseNotificationBody.mockReturnValue(notification);
    mockVerifyNotification.mockReturnValue(true);
    mockGetPaymentById.mockReturnValue({
      id: 1,
      user_id: 100,
      amount: 10000, // 100 RUB expected
      status: "pending",
    });
    mockClaimAndCreditPayment.mockReturnValue(true);
    mockGetUser.mockReturnValue({
      telegram_id: 100,
      username: "testuser",
      balance: 20000,
    });

    const body = buildUrlEncodedBody(notification);
    const res = await sendRequest("POST", "/webhooks/yoomoney", body);

    expect(res.statusCode).toBe(200);
    expect(res.body).toBe("OK");
    // 91 >= 100 * 0.9 = 90, so should be accepted
    expect(mockClaimAndCreditPayment).toHaveBeenCalledWith(1, 100, 10000);
  });

  it("does not double-credit (idempotency via claimAndCreditPayment)", async () => {
    const notification = makeNotification();

    mockParseNotificationBody.mockReturnValue(notification);
    mockVerifyNotification.mockReturnValue(true);
    mockGetPaymentById.mockReturnValue({
      id: 1,
      user_id: 100,
      amount: 10000,
      status: "pending",
    });
    // First call succeeds, subsequent calls return false (already claimed)
    mockClaimAndCreditPayment.mockReturnValue(false);

    const body = buildUrlEncodedBody(notification);
    const res = await sendRequest("POST", "/webhooks/yoomoney", body);

    expect(res.statusCode).toBe(200);
    expect(res.body).toBe("OK");
    expect(mockClaimAndCreditPayment).toHaveBeenCalledWith(1, 100, 10000);
    // User should NOT be notified when payment was already processed
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it("rejects invalid label (not a number)", async () => {
    const notification = makeNotification({ label: "abc" });

    mockParseNotificationBody.mockReturnValue(notification);
    mockVerifyNotification.mockReturnValue(true);

    const body = buildUrlEncodedBody(notification);
    const res = await sendRequest("POST", "/webhooks/yoomoney", body);

    expect(res.statusCode).toBe(200);
    expect(res.body).toBe("OK");
    expect(mockGetPaymentById).not.toHaveBeenCalled();
  });

  it("rejects when payment not found in DB", async () => {
    const notification = makeNotification({ label: "999" });

    mockParseNotificationBody.mockReturnValue(notification);
    mockVerifyNotification.mockReturnValue(true);
    mockGetPaymentById.mockReturnValue(undefined);

    const body = buildUrlEncodedBody(notification);
    const res = await sendRequest("POST", "/webhooks/yoomoney", body);

    expect(res.statusCode).toBe(200);
    expect(res.body).toBe("OK");
    expect(mockGetPaymentById).toHaveBeenCalledWith(999);
    expect(mockClaimAndCreditPayment).not.toHaveBeenCalled();
  });

  it("notifies admins on successful payment", async () => {
    mockConfig.adminIds = [500, 501];
    const notification = makeNotification();

    mockParseNotificationBody.mockReturnValue(notification);
    mockVerifyNotification.mockReturnValue(true);
    mockGetPaymentById.mockReturnValue({
      id: 1,
      user_id: 100,
      amount: 10000,
      status: "pending",
    });
    mockClaimAndCreditPayment.mockReturnValue(true);
    mockGetUser.mockReturnValue({
      telegram_id: 100,
      username: "testuser",
      balance: 20000,
    });

    const body = buildUrlEncodedBody(notification);
    await sendRequest("POST", "/webhooks/yoomoney", body);

    // User notification + 2 admin notifications = 3 calls
    expect(mockSendMessage).toHaveBeenCalledTimes(3);
    expect(mockSendMessage).toHaveBeenCalledWith(100, expect.any(String));
    expect(mockSendMessage).toHaveBeenCalledWith(500, expect.stringContaining("@testuser"));
    expect(mockSendMessage).toHaveBeenCalledWith(501, expect.stringContaining("@testuser"));
  });

  it("returns 404 for GET request", async () => {
    const res = await sendRequest("GET", "/webhooks/yoomoney");

    expect(res.statusCode).toBe(404);
    expect(res.body).toBe("Not Found");
  });

  it("returns 200 OK on unparseable notification body", async () => {
    mockParseNotificationBody.mockReturnValue(null);

    const res = await sendRequest("POST", "/webhooks/yoomoney", "garbage");

    expect(res.statusCode).toBe(200);
    expect(res.body).toBe("OK");
    expect(mockVerifyNotification).not.toHaveBeenCalled();
  });
});
