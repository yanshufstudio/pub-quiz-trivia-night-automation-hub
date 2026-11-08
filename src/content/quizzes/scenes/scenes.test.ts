import { describe, expect, it } from "vitest";
import { QUIZZES } from "../index";
import { SCENE_HEIGHT, SCENE_WIDTH, animatedScene, sceneMarkup } from "./index";

/** Each moving scene, the prefix of its own shape ids, and the classes it animates. */
const SCENES = [
  { slug: "thanksgiving", ids: "#tg-", moving: ["parade", "leg", "bob", "fall", "sway", "dangle", "hop"] },
  { slug: "christmas", ids: "#xm-", moving: ["twinkle", "star", "fall", "hop"] },
  { slug: "holiday-trivia", ids: "#hd-", moving: ["twinkle", "flicker", "swing", "hop"] },
];

describe("the moving quiz pictures", () => {
  it("is Thanksgiving, Christmas and holiday trivia; Halloween and Bonfire Night keep their still pictures", () => {
    expect(QUIZZES.filter((quiz) => animatedScene(quiz.slug)).map((quiz) => quiz.slug)).toEqual([
      "thanksgiving",
      "christmas",
      "holiday-trivia",
    ]);
  });

  it("has the 1200x630 shape of the quiz's PNG", () => {
    for (const quiz of QUIZZES.filter((q) => animatedScene(q.slug))) {
      expect([quiz.image.width, quiz.image.height]).toEqual([SCENE_WIDTH, SCENE_HEIGHT]);
      const markup = sceneMarkup(quiz.slug, animatedScene(quiz.slug)!, quiz.image.alt);
      expect(markup.match(/viewBox="0 0 1200 630"/g)).toHaveLength(2);
      expect(markup).toContain("aspect-ratio: 1200 / 630");
    }
  });

  it("is one image named by the quiz's alt text, escaped", () => {
    const markup = sceneMarkup("thanksgiving", animatedScene("thanksgiving")!, 'Pie & "leaves" <here>');
    expect(markup).toContain('role="img" aria-label="Pie &amp; &quot;leaves&quot; &lt;here&gt;"');
  });

  for (const { slug, ids, moving } of SCENES) {
    describe(slug, () => {
      it("stops moving with reduced motion and when printed", () => {
        const markup = sceneMarkup(slug, animatedScene(slug)!, "alt");
        expect(markup).toContain(
          `@media (prefers-reduced-motion: reduce), print { .quiz-scene-${slug}, .quiz-scene-${slug} * { animation: none !important; }`,
        );
      });

      it("is drawn from shapes and CSS alone: no script, no outside picture, no outside link", () => {
        const { back, front, css } = animatedScene(slug)!;
        for (const banned of ["<script", "<image", "<img", "<foreignObject", "url(http", "@import", "javascript:"]) {
          expect(back + front + css, banned).not.toContain(banned);
        }
        // The only links are to its own shapes (<use href="#...">), so two scenes never share an id.
        expect([...(back + front).matchAll(/href="([^"]*)"/g)].every((m) => m[1].startsWith(ids))).toBe(true);
        expect([...(back + front).matchAll(/\sid="([^"]*)"/g)].every((m) => `#${m[1]}`.startsWith(ids))).toBe(true);
      });

      it("keeps everything that moves on the front layer, so the still one never repaints", () => {
        const { back, front } = animatedScene(slug)!;
        for (const cls of moving) {
          expect(back, cls).not.toMatch(new RegExp(`class="[^"]*\\b${cls}\\b`));
          expect(front, cls).toMatch(new RegExp(`class="[^"]*\\b${cls}\\b`));
        }
      });

      it("scopes every rule to its own scene, so nothing leaks onto the page", () => {
        const { css } = animatedScene(slug)!;
        const selectors = [...css.matchAll(/^([^@\s{}][^{]*)\{/gm)].map((m) => m[1]);
        expect(selectors.length).toBeGreaterThan(10);
        for (const selector of selectors) expect(selector.trim()).toMatch(new RegExp(`^\\.quiz-scene-${slug} `));
      });
    });
  }
});
