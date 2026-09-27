---
name: verify
description: How to build, launch and drive TriviaFoundry by hand so a change can be observed running, rather than inferred from tests. Use when verifying a diff at its runtime surface.
---

# Verifying TriviaFoundry by running it

The surfaces are HTTP (route handlers) and the browser. Everything below was
used to verify the launch batch and worked; it is written down so the next
session does not cold-start.

## Launch it

`playwright.config.ts`'s `webServer.env` block is the canonical list of what the
app needs to run with nothing real behind it — read it first, it is kept current.
A verification run wants its own port and its own database so it cannot disturb
the e2e one:

```bash
export DATABASE_URL="file:$PWD/prisma/verify.db"
npx prisma migrate deploy
# then, with the env from playwright.config.ts plus:
#   BETTER_AUTH_URL=http://localhost:<port>
#   SIGN_IN_EMAIL_CAPTURE=1  RESEND_API_KEY=""   (enables the code readback route)
npx next dev -p <port>
```

Two things are easy to get wrong:

- **`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` decide whether a third of /sign-in
  renders at all.** The Google button, the in-app-browser notice and the "opened
  this from LinkedIn?" line all sit inside `{googleEnabled ? … : null}`. Without
  them the page looks fine and the thing you came to verify is simply absent.
  Dummy values are enough — nothing calls Google unless you press the button.
- Delete `prisma/verify.db` when you are done, and never `git add` it.

## Sign in as a real host

A browser cannot open an email, so the suite and you both read the code back:

```bash
curl -X POST $B/api/auth/email-otp/send-verification-otp \
  -H 'content-type: application/json' -H 'x-forwarded-for: 198.19.0.1' \
  -d '{"email":"someone@example.test","type":"sign-in"}'
curl $B/api/test/sign-in-emails          # pick the last entry's `code`
curl -c jar.txt -X POST $B/api/auth/sign-in/email-otp \
  -H 'content-type: application/json' -d '{"email":"…","otp":"<code>"}'
```

Better Auth rate-limits this path per IP (5 per 60s), so **send a distinct
`x-forwarded-for` per request** or you will be measuring its limiter instead of
whatever you meant to.

## Get a pack you own, without spending Anthropic credit

`POST /api/packs/seed` creates the demo pack, but it is deliberately ownerless
and therefore not editable. Export it and import it back to get one that is
yours — and edit the JSON on the way through to shape it (drop rounds to see
singular wording, and so on):

```bash
curl -b jar.txt $B/api/packs/$DEMO/export > pack.json     # then edit title/rounds
curl -b jar.txt -X POST $B/api/packs/import -H 'content-type: application/json' --data-binary @pack.json
```

`POST /api/packs/generate` needs a funded Anthropic key. Without one you can
still reach every guard in front of the model call (the caps and the ceiling),
but not generation itself or the credit-exhausted path.

## Drive a live game

`POST /api/sessions {packId}` returns `session.code` and `hostToken` — keep both.
Then `POST /api/sessions/<code>/advance {action, hostToken}` with
`start` / `reveal` / `next` / `end`. Teams: `POST …/join {name}` returns a team
`token`, and the team view is `GET /api/sessions/<code>?token=<t>`; the host's is
`?as=host&hostToken=<t>`. Scoring by hand is
`PATCH …/answers/<id> {isCorrect, points, hostToken}` — **`hostToken` is
required in the body and a missing one answers a bare 400 "Invalid override"**,
which reads like a rejected value rather than a missing field.

## Simulate the two outages worth simulating

- **Upstash unreachable** (N1): start the app with
  `UPSTASH_REDIS_REST_URL=http://127.0.0.1:9` and any token. The site must stay
  up (`/api/auth/get-session` 200) while generation refuses 503. Expect requests
  that touch a counter to take ~4.3s each, ~8.7s where two counters are
  consulted — the client retries before it gives up.
- **A cap reached** without the traffic to reach it: set the limit env var to
  `0` (`PRO_USER_DAILY_PACK_LIMIT`, `FREE_IP_DAILY_LIMIT`, `SIGNIN_CODE_*`). Each
  treats 0 as a deliberate kill switch and refuses without touching the counter.

## Play Paddle's side

Sign `"<ts>:<rawBody>"` with HMAC-SHA256 hex and send
`paddle-signature: ts=<ts>;h1=<hex>`. `src/test/paddle-fixtures.ts` has a
payload the SDK's `fromJson` accepts — copy its shape rather than inventing one.
`customData.creatorSig` is `"<issuedAtMs>.<base64url mac>"`, the MAC being
HMAC-SHA256 over `"<issuedAtMs>.<creatorId>"` keyed by
HMAC-SHA256(BETTER_AUTH_SECRET, `"triviafoundry:paddle-checkout:v1"`).

## Reading the database

Do not `new PrismaClient()` from a standalone script: this project uses a driver
adapter and a bare client fails with P2038. Read the SQLite file with
`python3 -c 'import sqlite3…'`, or better, observe state through the app
(`/api/creator/status`) so you are verifying the surface rather than the store.
