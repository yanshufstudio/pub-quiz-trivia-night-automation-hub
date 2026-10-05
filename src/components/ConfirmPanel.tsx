"use client";

import { useEffect, useRef } from "react";

/**
 * A deliberate second press for an action the room cannot take back — closing
 * a round, finishing the quiz, ending the game — with the same hardening as
 * "End game" on the one-question desk (L9, #37):
 *
 * - it acts only on a trusted click whose own pointer-down or Enter/Space
 *   key-down landed on the confirm button after the panel opened, so a
 *   synthesised click, or the tail of the press that opened the panel, does
 *   nothing;
 * - the safe choice takes the place of the button that opened the panel (full
 *   width, last) and the confirm button sits above it, so a double tap lands
 *   on "keep", never on "yes";
 * - focus goes to the safe choice, so a stray Enter or a remote's OK backs out.
 */
export function ConfirmPanel({
  title,
  body,
  confirmLabel,
  keepLabel,
  onConfirm,
  onKeep,
  busy = false,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  keepLabel: string;
  onConfirm: () => void;
  onKeep: () => void;
  busy?: boolean;
}) {
  const armed = useRef(false);
  const keepRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    keepRef.current?.focus();
  }, []);

  function confirmed(event: React.MouseEvent<HTMLButtonElement>) {
    if (!event.isTrusted || !armed.current) return;
    armed.current = false;
    onConfirm();
  }

  return (
    <div role="group" aria-labelledby="confirm-title" className="rounded-2xl border border-white/15 bg-stage-deep p-4">
      <h3 id="confirm-title" className="font-semibold text-stage-fg">
        {title}
      </h3>
      <p className="mt-1 text-sm text-stage-muted">{body}</p>
      <div className="mt-4 flex flex-col gap-3">
        <button
          type="button"
          onPointerDown={() => {
            armed.current = true;
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") armed.current = true;
          }}
          onClick={confirmed}
          disabled={busy}
          className="h-12 min-h-12 self-start rounded-xl bg-red-500/90 px-5 text-sm font-semibold text-white disabled:opacity-40"
        >
          {confirmLabel}
        </button>
        <button
          ref={keepRef}
          type="button"
          onClick={onKeep}
          className="h-14 min-h-14 w-full rounded-xl border border-white/20 text-base font-semibold text-stage-fg"
        >
          {keepLabel}
        </button>
      </div>
    </div>
  );
}
