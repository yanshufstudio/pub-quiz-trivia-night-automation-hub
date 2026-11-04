# Review instructions

TriviaFoundry: a Next.js app where a host builds or buys a quiz pack, runs it live on a TV screen, and teams answer on their phones. Accounts, packs and games live in Prisma; payments go through Paddle.

## Important here

- A paid feature, pack or credit reachable without a verified Paddle purchase, or a Paddle webhook handled without checking its signature or acted on twice.
- A purchase, sign-in, pack generation or game-state failure that the host or a team never sees.
- Live game state: a team's answer lost, counted twice, or scored against the wrong round when a phone reconnects or the host moves on.
- Pricing, refund, FAQ or how-it-works copy that promises something the code does not do.
- A Prisma migration that is not additive, or a query reachable by one host that returns another host's packs or games.
- An env var read without a guard that fails the build or start; `localhost` or a `*.vercel.app` host left in auth redirects or allowlists.

## Claims

`HANDOFF.md`, `PROMPTS.md`, `docs/` and PR text must not call a feature live, verified or working without pointing at the test, walk or run that shows it.

## Skip

`package-lock.json`, images, fonts and generated Prisma client code.
