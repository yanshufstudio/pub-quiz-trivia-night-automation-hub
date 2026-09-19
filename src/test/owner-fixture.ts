import { signInTestHost, type TestHost } from "./auth-fixture";

/**
 * A pack's owner: a signed-in host account plus the Creator behind it.
 *
 * This used to mint a bare `Creator` row and hand back a `pq_creator` cookie,
 * because that was all identity was. Host-side routes now require a real
 * account (src/lib/auth-guard.ts), so it signs one in instead — the shape is
 * unchanged, so the suites that thread `owner.id` into a pack and
 * `owner.cookieHeader` onto every write did not have to change with it.
 */
export async function testOwner(): Promise<TestHost> {
  return signInTestHost();
}
