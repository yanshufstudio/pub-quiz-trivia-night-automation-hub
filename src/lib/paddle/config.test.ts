import { afterEach, describe, expect, it, vi } from "vitest";
import { PaddleConfigError, paddleEnv, publicPaddleConfig, webhookSecret } from "./config";

afterEach(() => vi.unstubAllEnvs());

describe("paddle config", () => {
  it("defaults to sandbox", () => {
    vi.stubEnv("NEXT_PUBLIC_PADDLE_ENV", "");
    expect(paddleEnv()).toBe("sandbox");
  });

  it("returns production only for the exact value", () => {
    vi.stubEnv("NEXT_PUBLIC_PADDLE_ENV", "production");
    expect(paddleEnv()).toBe("production");
  });

  it("throws naming the first missing public value", () => {
    vi.stubEnv("NEXT_PUBLIC_PADDLE_CLIENT_TOKEN", "test_abc");
    vi.stubEnv("NEXT_PUBLIC_PADDLE_PRICE_MONTHLY", "");
    vi.stubEnv("NEXT_PUBLIC_PADDLE_PRICE_ANNUAL", "pri_y");
    expect(() => publicPaddleConfig()).toThrow(PaddleConfigError);
    expect(() => publicPaddleConfig()).toThrow("NEXT_PUBLIC_PADDLE_PRICE_MONTHLY");
  });

  it("returns all four public values", () => {
    vi.stubEnv("NEXT_PUBLIC_PADDLE_ENV", "sandbox");
    vi.stubEnv("NEXT_PUBLIC_PADDLE_CLIENT_TOKEN", "test_abc");
    vi.stubEnv("NEXT_PUBLIC_PADDLE_PRICE_MONTHLY", "pri_m");
    vi.stubEnv("NEXT_PUBLIC_PADDLE_PRICE_ANNUAL", "pri_y");
    expect(publicPaddleConfig()).toEqual({
      env: "sandbox",
      clientToken: "test_abc",
      priceMonthly: "pri_m",
      priceAnnual: "pri_y",
    });
  });

  it("throws when the webhook secret is empty", () => {
    vi.stubEnv("PADDLE_NOTIFICATION_WEBHOOK_SECRET", "");
    expect(() => webhookSecret()).toThrow("PADDLE_NOTIFICATION_WEBHOOK_SECRET");
  });
});
