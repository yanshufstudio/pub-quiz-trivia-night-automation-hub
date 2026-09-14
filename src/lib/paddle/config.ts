export class PaddleConfigError extends Error {}

export type PaddleEnv = "sandbox" | "production";

export function paddleEnv(): PaddleEnv {
  return process.env.NEXT_PUBLIC_PADDLE_ENV === "production" ? "production" : "sandbox";
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new PaddleConfigError(`${name} is not set`);
  return value;
}

/**
 * Browser-safe values. Next inlines NEXT_PUBLIC_* at build time, so these
 * must be read through the literal `process.env.NEXT_PUBLIC_...` form in
 * client components; this helper is for server code and the build check.
 */
export function publicPaddleConfig() {
  return {
    env: paddleEnv(),
    clientToken: required("NEXT_PUBLIC_PADDLE_CLIENT_TOKEN"),
    priceMonthly: required("NEXT_PUBLIC_PADDLE_PRICE_MONTHLY"),
    priceAnnual: required("NEXT_PUBLIC_PADDLE_PRICE_ANNUAL"),
  };
}

export function webhookSecret(): string {
  return required("PADDLE_NOTIFICATION_WEBHOOK_SECRET");
}

export function apiKey(): string {
  return required("PADDLE_API_KEY");
}
