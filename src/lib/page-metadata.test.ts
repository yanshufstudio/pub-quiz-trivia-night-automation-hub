import { describe, expect, it } from "vitest";
import { OG_IMAGE, pageMetadata } from "./page-metadata";

const base = { path: "/pricing", title: "A title", description: "A description." };

describe("pageMetadata", () => {
  it("shares the site card when a page gives no picture of its own", () => {
    // The literal is the shape every existing page had before `image` existed.
    // If this changes, every page's link preview changed with it.
    expect(pageMetadata(base)).toEqual({
      title: "A title",
      description: "A description.",
      alternates: { canonical: "/pricing" },
      openGraph: {
        type: "website",
        siteName: "TriviaFoundry",
        url: "/pricing",
        title: "A title",
        description: "A description.",
        images: [
          {
            url: "/og.png",
            width: 1200,
            height: 630,
            alt: "TriviaFoundry: writes your pub quiz or trivia night, then runs it live. A live scoreboard on a dark pub-green background.",
          },
        ],
      },
      twitter: {
        card: "summary_large_image",
        title: "A title",
        description: "A description.",
        images: [
          {
            url: "/og.png",
            alt: "TriviaFoundry: writes your pub quiz or trivia night, then runs it live. A live scoreboard on a dark pub-green background.",
          },
        ],
      },
    });
  });

  it("treats an explicit site card the same as none", () => {
    expect(pageMetadata({ ...base, image: OG_IMAGE })).toEqual(pageMetadata(base));
  });

  it("puts a page's own picture in og:image and the twitter image, and changes nothing else", () => {
    const image = { url: "/quizzes/halloween.png", width: 1200, height: 630, alt: "A picture." };
    const own = pageMetadata({ ...base, image });
    const site = pageMetadata(base);

    expect(own.openGraph?.images).toEqual([image]);
    expect(own.twitter?.images).toEqual([{ url: image.url, alt: image.alt }]);

    const withoutImages = (m: typeof own) => ({
      ...m,
      openGraph: { ...m.openGraph, images: undefined },
      twitter: { ...m.twitter, images: undefined },
    });
    expect(withoutImages(own)).toEqual(withoutImages(site));
  });
});
