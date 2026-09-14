"use client";

import { useTransition } from "react";
import { openCustomerPortal } from "./actions";

export function ManageSubscriptionButton() {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      onClick={() => start(() => openCustomerPortal())}
      disabled={pending}
      className="mt-4 h-11 rounded-xl border border-line px-5 text-sm font-semibold hover:bg-background disabled:opacity-50"
    >
      {pending ? "Opening…" : "Manage subscription"}
    </button>
  );
}
