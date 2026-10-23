import type { Metadata, ResolvingMetadata } from "next";
import { TeamPortal } from "./TeamPortal";

// The phone's tab, and the title of a WhatsApp link preview, which reads og:title.
const TITLE = "Join tonight’s quiz · TriviaFoundry";

// Setting openGraph or twitter replaces the layout's object rather than merging
// with it, so the layout's own values (image, site name, description, card) are
// read back from the parent and only the title is overridden. /play stays one of
// the pages robots.ts disallows: no canonical, no og:url.
export async function generateMetadata(_props: unknown, parent: ResolvingMetadata): Promise<Metadata> {
  const { openGraph, twitter } = await parent;
  return {
    title: TITLE,
    openGraph: { ...openGraph, title: TITLE },
    twitter: { ...twitter, title: TITLE },
  };
}

export default function PlayPage() {
  return <TeamPortal />;
}
