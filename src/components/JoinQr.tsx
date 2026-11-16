"use client";

import QRCode from "react-qr-code";
import { useT } from "@/i18n/react";
import { buildJoinUrl } from "@/lib/join-url";

// Scannable join link for the lobby. The origin is read at render time so
// the same build works on localhost, a preview URL, and production. Only
// rendered by client components, so window is always defined by then.
export function JoinQr({ code, size = 168 }: { code: string; size?: number }) {
  const t = useT();
  const joinUrl = buildJoinUrl(window.location.origin, code);
  return (
    <figure className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:items-center sm:gap-5">
      <div className="rounded-xl bg-white p-3">
        <QRCode value={joinUrl} size={size} role="img" aria-label={t("common.scanToJoin")} />
      </div>
      <figcaption className="text-center text-sm text-stage-muted sm:text-start">
        <span className="block font-semibold text-stage-fg">{t("common.scanToJoin")}</span>
        <span className="mt-1 block break-all font-mono text-xs">{joinUrl}</span>
      </figcaption>
    </figure>
  );
}
