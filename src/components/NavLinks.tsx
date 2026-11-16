"use client";

import Link from "next/link";
import type { MessageKey } from "@/i18n";
import { useT } from "@/i18n/react";

/** The header's page links, in the page's language (L1). A client component
 * because SiteHeader renders inside client pages (the create wizard) as well
 * as server ones, and the language reaches both through context. */
export function NavLinks({ links }: { links: readonly { href: string; key: MessageKey }[] }) {
  const t = useT();
  return links.map((link) => (
    <Link
      key={link.href}
      href={link.href}
      className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-md px-3 text-sm font-semibold text-stage-muted transition-colors hover:text-gold"
    >
      {t(link.key)}
    </Link>
  ));
}
