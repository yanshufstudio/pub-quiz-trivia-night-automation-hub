import { NextResponse, type NextRequest } from "next/server";

/**
 * An optimistic redirect for signed-out visitors, and nothing more.
 *
 * Next 16 renamed `middleware.ts` to `proxy.ts` (see
 * node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/
 * proxy.md). Next's authentication guide is explicit that a check here is
 * NOT a security boundary: it runs on prefetches, it can be skipped, and all
 * it can cheaply see is whether a cookie exists — not whether it is valid,
 * unexpired, or signed. The real check is `auth.api.getSession` in
 * src/lib/auth-guard.ts, which every gated page and API calls for itself.
 *
 * What this does buy: a host whose session has gone lands on /sign-in instead
 * of watching a page render its shell and then bounce. It never *grants*
 * anything — a forged cookie gets past this line and straight into the real
 * check, which fails.
 *
 * Pages only. APIs answer 401 JSON from their own handler, because a redirect
 * to an HTML page is a useless reply to `fetch`.
 */

/** Better Auth's session cookie, and the `__Secure-` prefix it uses over HTTPS. */
const SESSION_COOKIES = ["better-auth.session_token", "__Secure-better-auth.session_token"];

/**
 * Host-only page prefixes. Everything absent from this list is public or is
 * a team surface (/play), and must stay reachable with no account at all.
 */
const HOST_PAGE_PREFIXES = ["/create", "/packs", "/host"];

function isHostPage(pathname: string): boolean {
  return HOST_PAGE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!isHostPage(pathname)) return NextResponse.next();

  const hasSessionCookie = SESSION_COOKIES.some((name) => req.cookies.has(name));
  if (hasSessionCookie) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/sign-in";
  url.search = "";
  // Carry the whole path *and* query, so a signed-out host who followed a
  // deep link lands back on it rather than on a generic page.
  url.searchParams.set("next", `${pathname}${req.nextUrl.search}`);
  return NextResponse.redirect(url);
}

export const config = {
  // Never on /api (they answer 401 themselves, and /api/auth/* must not be
  // touched at all), never on static assets or the favicon/icon routes.
  matcher: ["/((?!api|_next/static|_next/image|.*\\.png$|.*\\.ico$).*)"],
};
