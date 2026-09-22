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
      {/* The brass rim, at every width. It used to be `hidden sm:block`, meant
          as "not at favicon sizes" — but `sm:` is the width of the SCREEN, not
          the size of the mark, so every phone lost the rim while the mark
          itself stayed the same ~24px as on a desktop. The favicon sizes this
          was guarding never render this component: the PNG icons are drawn by
          scripts/render-icons.ts, which sets its own rim. In the app the mark
          only appears inside a 1.35-1.5rem Wordmark, so it is 24-26px
          everywhere, and the rim is a clean hairline on any phone screen. */}
      <span
        className="absolute inset-0 rounded-full border-brass/70"
        style={{ borderWidth: "0.045em" }}
      />
      <span className="relative font-serif leading-none text-gold" style={{ fontSize: "0.72em", marginTop: "0.02em" }}>
        ?
      </span>
    </span>
  );
}
