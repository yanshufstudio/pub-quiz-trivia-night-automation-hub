"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SiteHeader } from "@/components/SiteHeader";
import { ArrowRightIcon } from "@/components/icons";

// The brief every visitor generates from unless they retype it, so it has to
// ask only for what the app can actually put in front of players: question
// text and nothing else. It used to end on a "picture-round-style" closer,
// which invited exactly the pack the app cannot show — a round whose
// questions need an image that never arrives.
const EXAMPLE =
  "A Friday-night pub quiz: four rounds covering 90s music, UK geography, movie quotes, and a general knowledge closer. Keep answers short and pub-friendly.";

export default function CreatePage() {
  const router = useRouter();
  const [prompt, setPrompt] = useState(EXAMPLE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);
  const [usage, setUsage] = useState<{ used: number; limit: number; plan: string } | null>(null);

  useEffect(() => {
    fetch("/api/creator/status")
      .then((res) => res.json())
      .then((data) => setUsage({ used: data.packsGeneratedInPeriod, limit: data.limit, plan: data.plan }));
  }, []);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotConfigured(false);
    try {
      const res = await fetch("/api/packs/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const isJson = res.headers.get("content-type")?.includes("application/json");
      const data = isJson ? await res.json() : null;
      if (!res.ok || !data) {
        setNotConfigured(res.status === 503);
        if (res.status === 403 && data) {
          setUsage({ used: data.packsGeneratedInPeriod, limit: data.limit, plan: "FREE" });
        }
        throw new Error(
          data?.error ?? `Generation failed (server returned status ${res.status}). Please try again.`
        );
      }
      router.push(`/packs/${data.pack.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
      setBusy(false);
    }
  }

  async function useDemoPack() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/packs/seed", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not create the demo pack");
      router.push(`/packs/${data.pack.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the demo pack");
      setBusy(false);
    }
  }

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-10">
        <h1 className="font-serif text-3xl font-semibold tracking-tight">Generate a quiz pack</h1>
        <p className="mt-2 text-muted">
          Tell the wizard what kind of night you are running. It will draft rounds, questions,
          answers, and points you can edit next.
        </p>
        {usage && usage.plan !== "PRO" ? (
          <p className="mt-2 text-sm text-muted">
            {usage.used}/{usage.limit} free packs used this month
          </p>
        ) : null}

        <form onSubmit={onSubmit} className="mt-8 space-y-5">
          <label className="block">
            <span className="text-sm font-medium">Brief</span>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={8}
              maxLength={2000}
              className="mt-2 w-full rounded-xl border border-line bg-white px-4 py-3 text-base leading-relaxed outline-none focus:ring-2 focus:ring-amber"
              required
            />
          </label>

          {error ? (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
              <p>{error}</p>
              {notConfigured ? (
                <button
                  type="button"
                  onClick={useDemoPack}
                  disabled={busy}
                  className="group mt-2 inline-flex items-center gap-1.5 font-semibold underline underline-offset-2 disabled:opacity-50"
                >
                  Use the demo pack instead
                  <ArrowRightIcon className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                </button>
              ) : null}
            </div>
          ) : null}

          {(() => {
            const atCap = !!usage && usage.plan !== "PRO" && usage.used >= usage.limit;
            return (
              <button
                type="submit"
                disabled={busy || prompt.trim().length === 0 || atCap}
                className="h-12 w-full rounded-xl bg-amber text-base font-semibold text-white hover:bg-amber-hover disabled:opacity-50 sm:w-auto sm:px-6"
              >
                {busy ? "Generating…" : atCap ? "Free limit reached" : "Generate pack"}
              </button>
            );
          })()}

          {usage && usage.plan !== "PRO" && usage.used >= usage.limit ? (
            <p className="text-sm text-muted">
              Upgrade to Pro for unlimited packs — coming soon. Use the demo pack instead for now.
            </p>
          ) : null}
        </form>
      </main>
    </>
  );
}
