"use client";

import { initializePaddle, type Paddle } from "@paddle/paddle-js";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useSession } from "@/lib/auth-client";
import { PRICE_ANNUAL_USD, PRICE_MONTHLY_USD, formatUsd } from "@/lib/pricing";

/**
 * The part of the Pro card that can take money, and the only client code on
 * /pricing.
 *
 * The page around it stays static on purpose: it is what Paddle's reviewer
 * and search crawlers read, and none of it depends on who is looking. This
 * island decides, in the browser, which of four things to show:
 *
 *   signed out            "Sign in to subscribe" — a subscription belongs to
 *                         an account, so there is nothing to buy without one.
 *   signed in, has a       "Manage subscription" — Paddle's customer portal —
 *   subscription           plus the Subscribe buttons when the subscription is
 *                          not currently paying for Pro (L13).
 *   signed in, never had   the two Subscribe buttons.
 *   one
 *   checkout not set up   a plain sentence instead of dead buttons. Only a
 *                         local or CI build can show this: next.config.ts
 *                         fails a production build without the
 *                         NEXT_PUBLIC_PADDLE_* values.
 *
 * It asks the server for the price id and the signed customData at the
 * moment of the click (POST /api/billing/checkout) rather than taking a
 * creator id from anywhere in the browser.
 *
 * Prices on the buttons come from src/lib/pricing.ts, the same constants as
 * the rest of the page; the live Paddle prices must be created at those
 * amounts.
 */

// Inlined at build time — which is why production's build guard checks them.
const CLIENT_TOKEN = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN ?? "";
const PADDLE_ENV = process.env.NEXT_PUBLIC_PADDLE_ENV === "production" ? "production" : "sandbox";

// `null` while loading; "unknown" if the status endpoint refused (a session
// that expired while the page was open), which is shown as signed out.
type Status =
  | { plan: string; hasSubscription: boolean; subscriptionStatus: string | null }
  | "unknown";

/** Reserved so the card does not change height when the session resolves. */
const SLOT = "mt-6 min-h-[7.5rem]";

export function ProCheckout() {
  const { data: session, isPending } = useSession();
  const signedIn = Boolean(session?.user);
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState<"month" | "year" | "portal" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const paddleRef = useRef<Paddle | null>(null);

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    fetch("/api/creator/status", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled) {
          setStatus(
            data
              ? {
                  plan: data.plan,
                  hasSubscription: Boolean(data.hasSubscription),
                  subscriptionStatus: data.subscriptionStatus ?? null,
                }
              : "unknown"
          );
        }
      })
      .catch(() => {
        if (!cancelled) setStatus("unknown");
      });
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  async function paddle(): Promise<Paddle> {
    if (paddleRef.current) return paddleRef.current;
    const instance = await initializePaddle({ token: CLIENT_TOKEN, environment: PADDLE_ENV });
    if (!instance) throw new Error("Checkout failed to load. Reload the page and try again.");
    paddleRef.current = instance;
    return instance;
  }

  async function subscribe(interval: "month" | "year") {
    setBusy(interval);
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interval }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) throw new Error(data?.error ?? "Could not start checkout. Please try again.");
      const p = await paddle();
      p.Checkout.open({
        items: [{ priceId: data.priceId, quantity: 1 }],
        customData: data.customData,
        customer: { email: data.customerEmail },
        settings: {
          variant: "one-page",
          // /create polls until the webhook has switched Pro on; the return
          // can beat the webhook by a few seconds.
          successUrl: `${window.location.origin}/create?upgraded=1`,
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start checkout. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function manage() {
    setBusy("portal");
    setError(null);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.url) throw new Error(data?.error ?? "Could not open the billing portal. Please try again.");
      window.location.assign(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open the billing portal. Please try again.");
      setBusy(null);
    }
  }

  const button =
    "inline-flex min-h-12 w-full items-center justify-center rounded-xl px-4 text-sm font-semibold disabled:opacity-60";

  /**
   * The two Subscribe buttons, defined once.
   *
   * Both the never-subscribed branch and the has-a-subscription-but-not-on-Pro
   * branch (L13) render them, and rendering them twice with their own labels is
   * how two names for one action get into a product.
   */
  const subscribeButtons = (
    <div className="grid gap-3">
      <button
        type="button"
        onClick={() => subscribe("month")}
        disabled={busy !== null}
        className={`${button} bg-amber text-white hover:bg-amber-hover`}
      >
        {busy === "month" ? "Opening checkout…" : `Subscribe monthly · ${formatUsd(PRICE_MONTHLY_USD)}`}
      </button>
      <button
        type="button"
        onClick={() => subscribe("year")}
        disabled={busy !== null}
        className={`${button} border border-amber text-amber hover:bg-amber hover:text-white`}
      >
        {busy === "year" ? "Opening checkout…" : `Subscribe yearly · ${formatUsd(PRICE_ANNUAL_USD)}`}
      </button>
    </div>
  );

  let body: React.ReactNode = null;
  if (isPending || (signedIn && !status)) {
    body = null;
  } else if (!signedIn || status === "unknown") {
    body = (
      <Link
        href="/sign-in?next=%2Fpricing"
        className={`${button} bg-amber text-white hover:bg-amber-hover`}
      >
        Sign in to subscribe
      </Link>
    );
  } else if (status?.hasSubscription) {
    /**
     * L13: keyed on *having a subscription*, not on being on Pro.
     *
     * It used to require `plan === "PRO"`, and `plan` is derived from Paddle's
     * status — so a subscription that Paddle had `paused`, or that the host had
     * cancelled and not yet replaced, showed the Subscribe buttons and no way
     * into the portal at all. That is exactly the person who most needs it:
     * resuming a paused subscription, or fixing the card behind a failed
     * payment, happens in Paddle's portal and nowhere else.
     *
     * `past_due` already counted as PRO (statusToPlan keeps Pro on through
     * dunning), so this is about `paused` and `canceled`.
     */
    const onPro = status.plan === "PRO";
    body = (
      <>
        {onPro ? (
          <>
            <p className="font-medium text-foreground">You are on Pro. Thank you.</p>
            <p className="mt-1 text-sm text-muted">
              Invoices, your card and cancelling are in the billing portal.
            </p>
          </>
        ) : (
          <>
            <p className="font-medium text-foreground">Your subscription is not active right now.</p>
            <p className="mt-1 text-sm text-muted">
              Resuming it, and your invoices and payment method, are in the billing portal. You can also
              start a new subscription below.
            </p>
          </>
        )}
        <button
          type="button"
          onClick={manage}
          disabled={busy !== null}
          className={`${button} mt-4 border border-line bg-background text-foreground hover:border-amber`}
        >
          {busy === "portal" ? "Opening…" : "Manage subscription"}
        </button>
        {!onPro && CLIENT_TOKEN ? <div className="mt-3">{subscribeButtons}</div> : null}
      </>
    );
  } else if (!CLIENT_TOKEN) {
    body = <p className="text-sm text-muted">Checkout is not switched on for this deployment.</p>;
  } else {
    body = subscribeButtons;
  }

  return (
    <div className={SLOT}>
      {body}
      {error ? (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
