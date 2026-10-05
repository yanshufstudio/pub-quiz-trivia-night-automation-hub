import type { Metadata } from "next";
import { TvDisplay } from "./TvDisplay";

export const metadata: Metadata = {
  title: "TV display — TriviaFoundry",
  robots: { index: false, follow: false },
};

/**
 * The pub's TV (RM9): triviafoundry.com/tv/ + the join code. No sign-in and no
 * key — it shows only what the room is meant to see, and the data behind it
 * (GET /api/sessions/[code]/display) is built to that rule.
 */
export default async function TvPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <TvDisplay code={code.toUpperCase()} />;
}
