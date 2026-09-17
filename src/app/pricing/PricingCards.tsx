"use client";

import { initializePaddle, type Paddle } from "@paddle/paddle-js";
import { useEffect, useState } from "react";

type Props = {
  creatorId: string | null;
  env: "sandbox" | "production";
  clientToken: string;
  priceMonthly: string;
  priceAnnual: string;
};

export function PricingCards({ creatorId: initialCreatorId, env, clientToken, priceMonthly, priceAnnual }: Props) {
  const [paddle, setPaddle] = useState<Paddle | null>(null);
  const [creatorId, setCreatorId] = useState<string | null>(initialCreatorId);
  const [error, setError] = useState<string | null>(null);
  const configured = clientToken !== "" && priceMonthly !== "" && priceAnnual !== "";

  // A first-time visitor has no identity yet, and a server component cannot
  // set the cookie, so ask the route handler to mint one before checkout.
  useEffect(() => {
    if (creatorId) return;
    let cancelled = false;
    fetch("/api/creator/ensure", { method: "POST" })
      .then((res) => res.json())
      .then((data: { creatorId?: string }) => {
        if (!cancelled && typeof data.creatorId === "string") setCreatorId(data.creatorId);
      })
      .catch(() => {
        if (!cancelled) setError("Could not start a session. Reload the page to try again.");
      });
    return () => {
      cancelled = true;
    };
  }, [creatorId]);

  useEffect(() => {
    if (!configured) return;
    initializePaddle({ token: clientToken, environment: env })
      .then((p) => {
        if (p) setPaddle(p);
        else setError("Checkout failed to load. Reload the page to try again.");
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Checkout failed to load."));
  }, [configured, clientToken, env]);

  function subscribe(priceId: string) {
    if (!paddle || !creatorId) return;
    paddle.Checkout.open({
      items: [{ priceId, quantity: 1 }],
      customData: { creatorId },
      settings: {
        variant: "one-page",
        successUrl: `${window.location.origin}/create?upgraded=1`,
      },
    });
  }

  const cards = [
    { id: priceMonthly, name: "Monthly", amount: "$5", per: "per month", label: "Subscribe monthly" },
    { id: priceAnnual, name: "Yearly", amount: "$25", per: "per year, two months free", label: "Subscribe yearly" },
  ];

  return (
    <section className="mt-8 grid gap-5 sm:grid-cols-2">
      {cards.map((card) => (
        <div key={card.name} className="rounded-2xl border border-line bg-white p-6">
          <h2 className="text-lg font-semibold">{card.name}</h2>
          <p className="mt-3 text-3xl font-semibold">
            {card.amount} <span className="text-base font-normal text-muted">{card.per}</span>
          </p>
          <ul className="mt-4 space-y-1 text-sm text-muted">
            <li>Unlimited AI-generated packs</li>
            <li>Everything in Free</li>
            <li>Cancel any time</li>
          </ul>
          <button
            type="button"
            onClick={() => subscribe(card.id)}
            disabled={!paddle || !creatorId}
            className="mt-6 h-12 w-full rounded-xl bg-amber text-base font-semibold text-white hover:bg-amber-hover disabled:opacity-50"
          >
            {card.label}
          </button>
        </div>
      ))}
      {!configured ? (
        <p role="alert" className="text-sm text-red-700 sm:col-span-2">
          Checkout is not configured on this deployment (missing NEXT_PUBLIC_PADDLE values).
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-red-700 sm:col-span-2">
          {error}
        </p>
      ) : null}
      <p className="text-xs text-muted sm:col-span-2">
        Payments are handled by Paddle, our merchant of record. Prices exclude VAT where applicable.
      </p>
    </section>
  );
}
