"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MAX_PACK_FILE_BYTES, PACK_TOO_BIG_TO_IMPORT_MESSAGE } from "@/lib/pack-file-limits";

/** "Import pack" for /packs: picks a JSON file exported from a pack editor's
 * "Export JSON", posts it to /api/packs/import, and opens the new pack. */
export function ImportPackButton() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Reset so picking the same file again after an error re-fires onChange.
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      if (file.size > MAX_PACK_FILE_BYTES) throw new Error(PACK_TOO_BIG_TO_IMPORT_MESSAGE);
      const text = await file.text();
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        throw new Error(`${file.name} isn't valid JSON.`);
      }
      const res = await fetch("/api/packs/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not import that pack.");
      router.push(`/packs/${data.pack.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not import that pack.");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        onChange={onFile}
        className="sr-only"
        aria-label="Pack file"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="inline-flex h-11 items-center rounded-xl border border-line bg-white px-4 text-sm font-semibold disabled:opacity-50"
      >
        {busy ? "Importing…" : "Import pack"}
      </button>
      {error ? (
        <p role="alert" className="max-w-xs text-right text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
