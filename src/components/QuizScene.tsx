"use client";

import { animatedScene, sceneMarkup } from "@/content/quizzes/scenes";

/**
 * A quiz's moving picture, inline at the top of its page (see
 * src/content/quizzes/scenes). The animation is CSS only, and the markup is
 * server-rendered into the HTML with the picture's 1200x630 shape, so nothing
 * shifts while it loads.
 *
 * A Client Component only so the markup is not sent a second time: as a
 * Server Component its whole string would also ride in the page's React
 * payload, which pushes the HTML past the first round trip and delays the
 * first paint. As a Client Component the payload carries just the slug and alt.
 */
export function QuizScene({ slug, alt }: { slug: string; alt: string }) {
  const scene = animatedScene(slug);
  if (!scene) throw new Error(`no moving scene for "${slug}" in src/content/quizzes/scenes`);
  return (
    <div
      className="overflow-hidden rounded-2xl border border-line"
      // The markup is this repo's own scene data (no user input); `alt` is escaped by sceneMarkup.
      dangerouslySetInnerHTML={{ __html: sceneMarkup(slug, scene, alt) }}
    />
  );
}
