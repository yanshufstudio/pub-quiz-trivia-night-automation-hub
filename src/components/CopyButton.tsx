"use client";

import { useEffect, useState } from "react";

/**
 * Copy a short string, and say that it worked.
 *
 * navigator.clipboard is unavailable on an insecure origin and can be refused
 * by permission policy, so the failure path is not theoretical: it falls back
 * to selecting the text so the host can copy it by hand, and never leaves the
 * button claiming success it did not have.
 */
export function CopyButton({
  value,
  label = "Copy",
  className = "",
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (state === "idle") return;
    const id = window.setTimeout(() => setState("idle"), 2000);
    return () => window.clearTimeout(id);
  }, [state]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setState("copied");
    } catch {
      setState("failed");
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      // 48px minimum, the floor every control on this site was brought up to.
      className={`inline-flex h-12 min-h-12 min-w-12 items-center justify-center rounded-xl px-4 text-sm font-semibold ${className}`}
      aria-live="polite"
    >
      {state === "copied" ? "Copied" : state === "failed" ? "Select and copy" : label}
    </button>
  );
}
