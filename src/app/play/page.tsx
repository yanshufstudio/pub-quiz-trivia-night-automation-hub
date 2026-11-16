import type { Metadata, ResolvingMetadata } from "next";
import { getT } from "@/i18n";
import { pageLanguage } from "@/i18n/page-language";
import { TeamPortal } from "./TeamPortal";

// Setting openGraph or twitter replaces the layout's object rather than merging
// with it, so the layout's own values (image, site name, description, card) are
// read back from the parent and only the title is overridden. /play stays one of
// the pages robots.ts disallows: no canonical, no og:url.
export async function generateMetadata(_props: unknown, parent: ResolvingMetadata): Promise<Metadata> {
  const { openGraph, twitter } = await parent;
  // The phone's tab, and the title of a WhatsApp link preview, which reads og:title.
  const TITLE = getT(await pageLanguage())("team.pageTitle");
  return {
    title: TITLE,
    openGraph: { ...openGraph, title: TITLE },
    twitter: { ...twitter, title: TITLE },
  };
}

export default function PlayPage() {
  return <TeamPortal />;
}
