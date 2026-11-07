import { describe, expect, it } from "vitest";
import { QUIZZES } from "../index";
import { SCENE_HEIGHT, SCENE_WIDTH, animatedScene, sceneMarkup } from "./index";

describe("the moving quiz pictures", () => {
  it("is Thanksgiving only; Halloween and Bonfire Night keep their still pictures", () => {
    expect(QUIZZES.filter((quiz) => animatedScene(quiz.slug)).map((quiz) => quiz.slug)).toEqual(["thanksgiving"]);
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

  it("stops moving with reduced motion and when printed", () => {
    const markup = sceneMarkup("thanksgiving", animatedScene("thanksgiving")!, "alt");
    expect(markup).toMatch(
      /@media \(prefers-reduced-motion: reduce\), print \{\s*\.quiz-scene-thanksgiving, \.quiz-scene-thanksgiving \* \{ animation: none !important; \}/,
    );
  });

  it("is drawn from shapes and CSS alone: no script, no outside picture, no outside link", () => {
    const { back, front, css } = animatedScene("thanksgiving")!;
    for (const banned of ["<script", "<image", "<img", "<foreignObject", "url(http", "@import", "javascript:"]) {
      expect(back + front + css, banned).not.toContain(banned);
    }
    // The only links are to its own shapes (<use href="#...">).
    expect([...(back + front).matchAll(/href="([^"]*)"/g)].every((m) => m[1].startsWith("#tg-"))).toBe(true);
  });

  it("keeps everything that moves on the front layer, so the still one never repaints", () => {
    const { back } = animatedScene("thanksgiving")!;
    for (const cls of ["parade", "leg", "bob", "fall", "sway", "dangle", "hop"]) {
      expect(back, cls).not.toMatch(new RegExp(`class="[^"]*\\b${cls}\\b`));
    }
  });

  it("scopes every rule to its own scene, so nothing leaks onto the page", () => {
    const { css } = animatedScene("thanksgiving")!;
    const selectors = [...css.matchAll(/^([^@\s{}][^{]*)\{/gm)].map((m) => m[1]);
    expect(selectors.length).toBeGreaterThan(10);
    for (const selector of selectors) expect(selector.trim()).toMatch(/^\.quiz-scene-thanksgiving /);
  });
});
