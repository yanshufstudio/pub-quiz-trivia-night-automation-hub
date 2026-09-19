"use client";

import { createAuthClient } from "better-auth/react";
import { emailOTPClient } from "better-auth/client/plugins";

/**
 * The browser half of Better Auth.
 *
 * No `baseURL`: the client defaults to the page's own origin, which is the
 * right answer on the production domain, on every preview deployment, and on
 * `localhost:4517` in the e2e suite — none of which can be known at build
 * time from a single constant.
 */
export const authClient = createAuthClient({
  plugins: [emailOTPClient()],
});

export const { useSession, signIn, signOut, emailOtp } = authClient;
