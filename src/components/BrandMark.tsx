/**
 * BrandMark — "The Coaster": a bottle-green beer mat with a brass rim and a
 * neon-amber question mark in the sign's slab face.
 *
 * Scales off font-size only, so it works anywhere: <BrandMark className="text-[22px]" />
 * Tokens used: --stage-deep, --brass, --gold. No new colors. The PNG icon
 * set in public/ is rendered from this same mark (see scripts/render-icons.ts).
 */
export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`relative inline-flex flex-none items-center justify-center rounded-full bg-stage-deep ${className}`}
      style={{ width: "1em", height: "1em" }}
    >
      {/* Brass rim only above ~28px — it turns to mud at favicon sizes. */}
      <span
        className="absolute inset-0 hidden rounded-full border-brass/70 sm:block"
        style={{ borderWidth: "0.045em" }}
      />
      <span className="relative font-serif leading-none text-gold" style={{ fontSize: "0.72em", marginTop: "0.02em" }}>
        ?
      </span>
    </span>
  );
}
