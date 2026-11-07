import { thanksgivingScene } from "./thanksgiving";

/**
 * A moving picture for the top of a quiz page: a 1200x630 SVG drawn from plain
 * shapes and animated with CSS only. The page shows it inline
 * (src/components/QuizScene.tsx); scripts/render-quiz-og.ts renders the same
 * markup with motion off and saves it as the quiz's PNG (its og:image), so a
 * shared link and the page show the same frame.
 *
 * The still frame is the scene with no animation applied, so every animation
 * starts from where its shape is drawn. Original shapes only; no photos, film
 * stills, posters or characters.
 *
 * A quiz with no entry here keeps its PNG at the top of the page. A new season
 * is one module beside this one and one line in ANIMATED_SCENES.
 */
/**
 * The scene is two SVGs, one over the other, so the browser repaints only the
 * moving layer each frame and never the gradients and blur under it. Colours
 * come from the site's tokens (var(--gold) and so on).
 */
export type AnimatedScene = {
  /** Inside the still <svg>, at the back. Holds the scene's <defs>. */
  back: string;
  /** Inside the moving <svg>, in front: everything that is animated. */
  front: string;
  /**
   * The scene's own rules and keyframes, every selector under `.quiz-scene-<slug>`.
   * Every animation waits var(--start) and begins from the still frame, so the
   * page paints its first frame, the PNG's, before anything moves.
   */
  css: string;
};

const ANIMATED_SCENES: Record<string, AnimatedScene> = {
  thanksgiving: thanksgivingScene,
};

export function animatedScene(slug: string): AnimatedScene | undefined {
  return ANIMATED_SCENES[slug];
}

export const SCENE_WIDTH = 1200;
export const SCENE_HEIGHT = 630;

function escapeAttr(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * The scene's <style> and its two layers, ready to drop into a page. With
 * prefers-reduced-motion, and when printing, nothing moves: the still frame
 * shows. The whole scene is one image to assistive tech, named by `alt`.
 */
/** Whitespace between tags and runs of spaces carry nothing; the markup is sent twice (HTML and the React payload). */
function tight(markup: string): string {
  return markup.replace(/>\s+</g, "><").replace(/\s{2,}/g, " ");
}

export function sceneMarkup(slug: string, scene: AnimatedScene, alt: string): string {
  const root = `quiz-scene-${slug}`;
  const viewBox = `0 0 ${SCENE_WIDTH} ${SCENE_HEIGHT}`;
  return tight(`<style>
.${root} { position: relative; aspect-ratio: ${SCENE_WIDTH} / ${SCENE_HEIGHT}; }
.${root} > svg { position: absolute; inset: 0; display: block; width: 100%; height: 100%; }
.${root} > .moving { will-change: transform; --start: 1.2s; }
${scene.css}
@media (prefers-reduced-motion: reduce), print {
  .${root}, .${root} * { animation: none !important; }
}
</style><div class="${root}" role="img" aria-label="${escapeAttr(alt)}"><svg viewBox="${viewBox}" xmlns="http://www.w3.org/2000/svg">${scene.back}</svg><svg class="moving" viewBox="${viewBox}" xmlns="http://www.w3.org/2000/svg">${scene.front}</svg></div>`);
}
