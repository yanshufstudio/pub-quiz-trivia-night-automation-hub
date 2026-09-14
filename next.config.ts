import type { NextConfig } from "next";

// A Vercel variable typed as legacy "Secret" resolves empty at build time
// and would ship a /pricing page whose buttons do nothing. Fail the build
// instead. Only enforced for production builds so local `next build`
// experiments and CI without Paddle values still work.
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
