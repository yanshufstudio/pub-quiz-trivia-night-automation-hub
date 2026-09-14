"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_NAME } from "@/lib/creator";
import { db } from "@/lib/db";
import { getPaddle } from "@/lib/paddle/client";

/** Mints a Paddle customer-portal session for the cookie's creator and
 * redirects there. Throws (surfacing Next's error boundary) rather than
 * silently returning if the creator has no Paddle customer. */
export async function openCustomerPortal(): Promise<never> {
  const deviceKey = (await cookies()).get(COOKIE_NAME)?.value;
  const creator = deviceKey ? await db.creator.findUnique({ where: { deviceKey } }) : null;
  if (!creator?.paddleCustomerId) {
    throw new Error("No subscription is attached to this browser. Use Restore Pro if you subscribed before.");
  }
  const session = await getPaddle().customerPortalSessions.create(
    creator.paddleCustomerId,
    creator.paddleSubscriptionId ? [creator.paddleSubscriptionId] : []
  );
  redirect(session.urls.general.overview);
}
