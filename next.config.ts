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

/**
 * Response headers every path gets (L17).
 *
 * What each one is actually for here, rather than because a checklist said so:
 *
 * - **X-Frame-Options: DENY** — nothing on this site should ever be framed. The
 *   host desk carries the controls that advance a live quiz and the answers for
 *   the current question; the editor carries every answer in a pack. Framing
 *   either is the setup for a clickjack.
 *
 *   This governs *our* pages being framed by somebody else. It does **not**
 *   affect Paddle's overlay checkout, which is Paddle's iframe inside our page —
 *   the framed document there is Paddle's and carries Paddle's headers. Google
 *   sign-in is a full-page redirect to accounts.google.com, not a frame, so it is
 *   unaffected too.
 *
 * - **Referrer-Policy: strict-origin-when-cross-origin** — paths on this site
 *   carry things worth not leaking in a Referer: a five-character join code, a
 *   pack id, and `/sign-in/confirm`, whose query string carries a live sign-in
 *   code. Cross-origin requests now send only the origin.
 *
 * - **Permissions-Policy** — the app asks for no camera, microphone or location
 *   and never has, so this is a statement that stays true rather than a
 *   restriction on anything. It applies to embedded frames as well as to us; see
 *   the note in the PR about Paddle's optional card scanning.
 *
 * - **X-Content-Type-Options: nosniff** — the app serves uploaded image bytes
 *   from its own origin (/api/questions/[id]/media). Those responses already set
 *   a Content-Type derived from the bytes' own magic number rather than from
 *   anything the uploader said, and this is the second lock: a browser must not
 *   reconsider that type and decide something is a script.
 */
const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "X-Content-Type-Options", value: "nosniff" },
] as const;

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: [...SECURITY_HEADERS] }];
  },
};

export default nextConfig;
