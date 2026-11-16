// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Pack } from "@/lib/api-types";
import { memoryStorage, readable } from "@/test/readable";

/**
 * L1: every word the other app pages show (create wizard, packs list, pack
 * editor, sign-in, account corner, sign-in email, not-found), frozen as it
 * was before they moved to message files. Written before the move and
 * required to match after it, like src/test/english-output.test.tsx for the
 * game screens.
 */

const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn(), back: vi.fn(), forward: vi.fn() };
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/",
  redirect: vi.fn(),
  notFound: vi.fn(),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const session: { data: { user: { name: string; email: string } } | null; isPending: boolean } = {
  data: null,
  isPending: false,
};
vi.mock("@/lib/auth-client", () => ({
  useSession: () => session,
  signOut: vi.fn(async () => ({})),
  signIn: {
    emailOtp: vi.fn(async () => ({ error: { status: 400, code: "INVALID_OTP" } })),
    social: vi.fn(async () => ({ error: { status: 500 } })),
  },
  emailOtp: { sendVerificationOtp: vi.fn(async () => ({ error: null })) },
}));
vi.mock("@/lib/auth-guard", () => ({
  requireHostPage: vi.fn(async () => ({ creator: { id: "creator-1" } })),
  hostSessionForPage: vi.fn(async () => null),
  safeNextPath: (next: string | undefined) => next ?? "/packs",
}));
vi.mock("@/lib/auth", () => ({ isGoogleSignInConfigured: () => true }));

const dbPacks: unknown[] = [];
const dbGames: unknown[] = [];
vi.mock("@/lib/db", () => ({
  db: {
    quizPack: { findMany: vi.fn(async () => dbPacks) },
    session: { findMany: vi.fn(async () => dbGames) },
  },
}));

const { default: NotFound } = await import("@/app/not-found");
const { default: SignInPage } = await import("@/app/sign-in/page");
const { default: ConfirmSignInPage } = await import("@/app/sign-in/confirm/page");
const { SignInForm } = await import("@/app/sign-in/SignInForm");
const { default: PacksPage } = await import("@/app/packs/page");
const { CreateWizard } = await import("@/app/create/CreateWizard");
const { PackEditor } = await import("@/app/packs/[id]/PackEditor");
const { sendSignInEmail } = await import("@/lib/sign-in-email");

const ok = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const press = (label: string) => fireEvent.click(screen.getByRole("button", { name: label }));
const settle = async () => {
  await act(async () => {});
  await act(async () => {});
};

beforeEach(() => {
  vi.stubGlobal("localStorage", memoryStorage());
  session.data = null;
  session.isPending = false;
  dbPacks.length = 0;
  dbGames.length = 0;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("not-found and the site header", () => {
  it("signed out", async () => {
    const { container } = render(await NotFound());
    expect(readable(container)).toMatchSnapshot();
  });

  it("signed in", async () => {
    session.data = { user: { name: "Paul Host", email: "paul@example.test" } };
    const { container } = render(await NotFound());
    expect(readable(container)).toMatchSnapshot();
  });
});

describe("sign-in", () => {
  it("the page, with Google and an error from it", async () => {
    const page = await SignInPage({ searchParams: Promise.resolve({ error: "state_mismatch" }) });
    const { container } = render(page);
    expect(readable(container)).toMatchSnapshot();
  });

  it("an unknown error code from Google", async () => {
    const page = await SignInPage({ searchParams: Promise.resolve({ error: "weird" }) });
    const { container } = render(page);
    expect(readable(container.querySelector("[role=alert]")!)).toMatchSnapshot();
  });

  it("the code step, and a wrong code", async () => {
    const { container } = render(<SignInForm next="/packs" googleEnabled={false} initialError={null} />);
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "host@example.test" } });
    fireEvent.submit(screen.getByRole("button", { name: "Email me a sign-in code" }));
    await settle();
    fireEvent.change(screen.getByLabelText("Sign-in code"), { target: { value: "123456" } });
    fireEvent.submit(screen.getByRole("button", { name: "Sign in" }));
    await settle();
    expect(readable(container)).toMatchSnapshot();
  });

  it("the confirm page, usable and not", async () => {
    const good = render(
      await ConfirmSignInPage({ searchParams: Promise.resolve({ email: "host@example.test", code: "123456" }) })
    );
    press("Sign in");
    await settle();
    const parts = [readable(good.container)];
    good.unmount();
    const bad = render(await ConfirmSignInPage({ searchParams: Promise.resolve({}) }));
    parts.push(readable(bad.container));
    expect(parts.join("\n---\n")).toMatchSnapshot();
  });
});

describe("the sign-in email", () => {
  it("subject, text and HTML", async () => {
    const keep = { key: process.env.RESEND_API_KEY, from: process.env.EMAIL_FROM };
    process.env.RESEND_API_KEY = "test-key";
    process.env.EMAIL_FROM = "TriviaFoundry <hello@example.test>";
    const send = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", send);
    try {
      await sendSignInEmail({ email: "host@example.test", code: "123456", url: "https://example.test/sign-in/confirm" });
    } finally {
      process.env.RESEND_API_KEY = keep.key;
      process.env.EMAIL_FROM = keep.from;
      if (keep.key === undefined) delete process.env.RESEND_API_KEY;
      if (keep.from === undefined) delete process.env.EMAIL_FROM;
    }
    const body = JSON.parse((send.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    // The HTML is wrapped in the language's lang and dir once it has one (L1),
    // which changes nothing a reader sees; the words inside are what is frozen.
    const html = (body.html as string).replace(/^<div lang="en" dir="ltr">([\s\S]*)<\/div>$/, "$1");
    expect([body.subject, body.text, html].join("\n---\n")).toMatchSnapshot();
    expect(body.html).toMatch(/^<div lang="en" dir="ltr">/);
  });
});

const createdAt = new Date("2026-11-01T12:00:00Z");

describe("packs list", () => {
  it("empty", async () => {
    const { container } = render(await PacksPage());
    expect(readable(container)).toMatchSnapshot();
  });

  it("with packs and live games", async () => {
    dbPacks.push(
      { id: "p1", title: "Friday Quiz", createdAt, rounds: [{ questions: [{}, {}] }, { questions: [{}] }] },
      { id: "p2", title: "One Round", createdAt, rounds: [{ questions: [{}] }] }
    );
    dbGames.push(
      { code: "ABCDE", status: "LOBBY", createdAt, pack: { title: "Friday Quiz" } },
      { code: "FGHJK", status: "ROUND_OPEN", createdAt, pack: { title: "One Round" } }
    );
    const { container } = render(await PacksPage());
    // The date is the browser's own locale and is left as it was (see the PR).
    expect(readable(container).replaceAll(createdAt.toLocaleDateString(), "<date>")).toMatchSnapshot();
  });

  it("an import that fails", async () => {
    dbPacks.push({ id: "p1", title: "Friday Quiz", createdAt, rounds: [{ questions: [{}] }] });
    const { container } = render(await PacksPage());
    const file = new File(["not json"], "pack.json", { type: "application/json" });
    fireEvent.change(screen.getByLabelText("Pack file"), { target: { files: [file] } });
    await settle();
    expect(readable(container.querySelector("[role=alert]")!)).toMatchSnapshot();
  });
});

describe("create wizard", () => {
  function wizard(status: unknown, upgraded = false) {
    vi.stubGlobal("fetch", vi.fn(async () => ok(status)));
    return render(<CreateWizard upgraded={upgraded} />);
  }

  it("free, with allowance left", async () => {
    const { container } = wizard({ packsGeneratedInPeriod: 1, limit: 3, plan: "FREE" });
    await settle();
    expect(readable(container)).toMatchSnapshot();
  });

  it("free, at the limit", async () => {
    const { container } = wizard({ packsGeneratedInPeriod: 3, limit: 3, plan: "FREE" });
    await settle();
    expect(readable(container.querySelector("main")!)).toMatchSnapshot();
  });

  it("pro, and just upgraded", async () => {
    const pro = wizard({ packsGeneratedInPeriod: 5, limit: 3, plan: "PRO" });
    await settle();
    const parts = [readable(pro.container.querySelector("main")!)];
    pro.unmount();
    const paying = wizard({ packsGeneratedInPeriod: 0, limit: 3, plan: "FREE" }, true);
    await settle();
    parts.push(readable(paying.container.querySelector("main")!));
    expect(parts.join("\n---\n")).toMatchSnapshot();
  });

  it("while generating, and when generation fails", async () => {
    let answer: (res: Response) => void = () => {};
    const fetchMock = vi.fn(async (url: string) =>
      url === "/api/creator/status"
        ? ok({ packsGeneratedInPeriod: 0, limit: 3, plan: "FREE" })
        : new Promise<Response>((resolve) => (answer = resolve))
    );
    vi.stubGlobal("fetch", fetchMock);
    const { container } = render(<CreateWizard />);
    await settle();
    fireEvent.submit(screen.getByRole("button", { name: "Generate pack" }));
    await settle();
    const parts = [readable(container.querySelector("form")!)];
    answer(ok({ error: "Generation is not set up here.", notConfigured: true }, 503));
    await settle();
    parts.push(readable(container.querySelector("form")!));
    fireEvent.submit(screen.getByRole("button", { name: "Generate pack" }));
    await settle();
    answer(ok({ error: "That brief asks for something we can't write.", declined: true }, 422));
    await settle();
    parts.push(readable(container.querySelector("form")!));
    fireEvent.submit(screen.getByRole("button", { name: "Generate pack" }));
    await settle();
    answer(new Response("oops", { status: 502 }));
    await settle();
    parts.push(readable(container.querySelector("form")!));
    expect(parts.join("\n---\n")).toMatchSnapshot();
  });
});

const pack: Pack = {
  id: "pack-1",
  title: "Friday Quiz",
  prompt: "general knowledge",
  createdAt: "2026-11-01T00:00:00.000Z",
  language: "en",
  reviewStatus: "not_checked",
  rounds: [
    {
      id: "r1",
      index: 0,
      title: "General",
      category: "General knowledge",
      questions: [
        { id: "p1", index: 0, text: "Capital of Australia?", answer: "Canberra", points: 1, type: "TEXT", options: [], acceptableAnswers: ["canberra city"], hasMedia: false },
        { id: "p2", index: 1, text: "Pick one", answer: "Blue", points: 2, type: "MULTIPLE_CHOICE", options: ["Red", "Blue"], acceptableAnswers: [], hasMedia: true },
      ],
    },
    {
      id: "r2",
      index: 1,
      title: "Closer",
      category: "Music",
      questions: [{ id: "p3", index: 0, text: "Who sang it?", answer: "Abba", points: 1, type: "TEXT", options: [], acceptableAnswers: [], hasMedia: false }],
    },
  ],
};

describe("pack editor", () => {
  it("an editable pack, with the unchecked banner", async () => {
    const { container } = render(<PackEditor pack={pack} canEdit />);
    await settle();
    expect(readable(container)).toMatchSnapshot();
  });

  it("a shared, read-only pack", async () => {
    const { container } = render(<PackEditor pack={{ ...pack, reviewStatus: null }} canEdit={false} />);
    await settle();
    expect(readable(container)).toMatchSnapshot();
  });

  it("delete confirmations and failures", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ok({}, 500)));
    const { container } = render(<PackEditor pack={{ ...pack, reviewStatus: null }} canEdit />);
    fireEvent.click(screen.getAllByRole("button", { name: "Delete round" })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: "Delete" })[0]);
    const parts = [readable(container.querySelector("section")!)];
    fireEvent.click(screen.getByRole("button", { name: "Confirm?" }));
    await settle();
    parts.push(readable(container.querySelector(".bg-red-50")!));
    press("Start live session");
    await settle();
    parts.push(readable(container.querySelector(".bg-red-50")!));
    press("Export JSON");
    await settle();
    parts.push(readable(container.querySelector(".bg-red-50")!));
    expect(parts.join("\n---\n")).toMatchSnapshot();
  });

  it("a save that fails because the host was signed out, or the network dropped", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ok({}, 401)));
    const { container } = render(<PackEditor pack={{ ...pack, reviewStatus: null }} canEdit />);
    const [text] = screen.getAllByDisplayValue("Capital of Australia?");
    fireEvent.change(text, { target: { value: "Capital of Austria?" } });
    fireEvent.blur(text);
    await settle();
    const parts = [readable(container.querySelector(".bg-red-50")!), screen.getByText("Couldn’t save").textContent!];
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));
    fireEvent.change(text, { target: { value: "Capital of Belgium?" } });
    fireEvent.blur(text);
    await settle();
    parts.push(readable(container.querySelector(".bg-red-50")!));
    expect(parts.join("\n---\n")).toMatchSnapshot();
  });
});
