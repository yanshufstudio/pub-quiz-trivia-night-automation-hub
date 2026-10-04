// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

/**
 * After a good code, both sign-in surfaces leave by a full page load, never
 * by the client router.
 *
 * The header's Create and Packs links are prefetched while the page is signed
 * out, and the proxy answers those prefetches with a redirect back to
 * /sign-in. `router.push` after `router.refresh` replayed that cached redirect
 * on the previews: the session was minted, but the tab stayed on
 * /sign-in?next=… with "Signing in…" for good. The e2e spec cannot show it
 * under `next dev`, which does not prefetch, so this pins the call itself.
 */

const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn(), back: vi.fn(), forward: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/auth-client", () => ({
  signIn: {
    emailOtp: vi.fn(async () => ({ error: null })),
    social: vi.fn(async () => ({ error: null })),
  },
  emailOtp: { sendVerificationOtp: vi.fn(async () => ({ error: null })) },
}));

const { SignInForm } = await import("./SignInForm");
const { ConfirmSignIn } = await import("./confirm/ConfirmSignIn");

const assign = vi.fn();

beforeEach(() => {
  Object.values(router).forEach((fn) => fn.mockClear());
  assign.mockClear();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, assign },
  });
});

afterEach(() => cleanup());

describe("after a good code", () => {
  for (const next of ["/create", "/packs"]) {
    it(`the code form loads ${next} in full and never pushes the router`, async () => {
      render(<SignInForm next={next} googleEnabled={false} initialError={null} />);

      fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "host@example.test" } });
      fireEvent.submit(screen.getByRole("button", { name: "Email me a sign-in code" }));
      const codeField = await screen.findByLabelText("Sign-in code");

      fireEvent.change(codeField, { target: { value: "273502" } });
      fireEvent.submit(screen.getByRole("button", { name: "Sign in" }));

      await waitFor(() => expect(assign).toHaveBeenCalledWith(next));
      expect(router.push).not.toHaveBeenCalled();
    });
  }

  it("the emailed-link page loads /packs in full and never pushes the router", async () => {
    render(<ConfirmSignIn email="host@example.test" code="273502" />);

    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(assign).toHaveBeenCalledWith("/packs"));
    expect(router.push).not.toHaveBeenCalled();
  });
});
