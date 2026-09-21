import type { NextConfig } from "next";

// /pricing's Subscribe buttons need these at build time: Next inlines
// NEXT_PUBLIC_* values into the client bundle, so a production build without
// them would ship buttons that cannot open a checkout. A Vercel variable typed
// as the legacy "Secret" also resolves empty at build time, with the same
// result. So a production build that lacks any of them fails, loudly, instead.
//
// Only production builds are checked. Preview, CI and local builds without
// Paddle values still work, and /pricing says checkout is not switched on
// rather than showing a button (src/app/pricing/ProCheckout.tsx).
const REQUIRED_PUBLIC_PADDLE = [
  "NEXT_PUBLIC_PADDLE_ENV",
  "NEXT_PUBLIC_PADDLE_CLIENT_TOKEN",
  "NEXT_PUBLIC_PADDLE_PRICE_MONTHLY",
  "NEXT_PUBLIC_PADDLE_PRICE_ANNUAL",
] as const;

if (process.env.VERCEL_ENV === "production") {
  for (const name of REQUIRED_PUBLIC_PADDLE) {
    if (!process.env[name]) {
      throw new Error(`Build aborted: ${name} is empty. Set it as a Vercel Config variable and redeploy.`);
    }
  }
}

const nextConfig: NextConfig = {};

export default nextConfig;
