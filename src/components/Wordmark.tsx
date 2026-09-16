import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";

/**
 * "Triviafoundry" as the lit sign: the coaster mark, then the name in the
 * slab display face in neon amber. One word, capital T — never "Trivia
 * Foundry", never camel case.
 *
 * Sizes off font-size only. `glow` adds the sign's halo — reserved for the
 * homepage hero; on ordinary chrome the amber alone is enough.
 */
export function Wordmark({
  href,
  className = "",
  glow = false,
}: {
  href?: string;
  className?: string;
  glow?: boolean;
}) {
  const inner = (
    <>
      <BrandMark className="text-[1.1em]" />
      <span className={`font-serif leading-none text-gold ${glow ? "sign-glow" : ""}`}>Triviafoundry</span>
    </>
  );
  const classes = `inline-flex items-center gap-[0.45em] ${className}`;
  return href ? (
    <Link href={href} className={classes} aria-label="Triviafoundry home">
      {inner}
    </Link>
  ) : (
    <span className={classes}>{inner}</span>
  );
}
