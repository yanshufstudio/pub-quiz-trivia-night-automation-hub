# Sandbox walk on the paddle-accounts preview: PASSED, 22 Sep 2026 evening

Gate item 1 of the Thursday gate (planning's rules, `claude/paddle-rework-2026-09-21.md` in the Cowork project). Walked by Paul in Chrome, one step at a time, with Claude reading each screenshot; ran 20:25–20:45 Israel time (17:25–17:45 UTC) on the branch preview of `claude/paddle-accounts` at **`81457b9`** (master `11aa3c6` merged in that evening, see `claude/paddle-accounts-rebase-2026-09-22.md`).

Preview: `https://pub-quiz-trivia-night-automation-hub-git-claude-3b6983-privlin.vercel.app`. Seller: the shared Yanshuf Studio sandbox. Account: **privlin+paddle@gmail.com** (new to the app, signed in by emailed code). Sandbox subscription `sub_01m352vgmq9878shxtdw7p9nms`, creatorId `cmucya71500000…`.

## The steps and what each showed

1. **Notification destination** `ntfset_01m2jnfk812qzt6ekwr1hye0gw` edited in place (URL only, secret kept, so Vercel Preview's `PADDLE_NOTIFICATION_WEBHOOK_SECRET` still matched) → `<preview>/api/paddle/webhook`. Active, 10 events, usage Platform + Simulation.
2. **/pricing signed out**: "Sign in to subscribe". Signed in as privlin+paddle → the two Subscribe buttons ($5 monthly, $45 yearly). The island's three states all seen.
3. **Subscribe monthly** → Paddle checkout opened on the new preview host with no domain-approval trouble, Test Mode, US$5.00/month, "then US$5.00/month from 22 Oct 2026", VAT $0 (Israel). It went straight to the card step, i.e. the account email was prefilled from the session. Paid with 4242.
4. **Return** to `/create?upgraded=1` → "You are on Pro: no pack limit. Manage subscription". /pricing then read "You are on Pro. Thank you." with a Manage subscription button.
5. **Manage subscription** → Paddle's customer portal opened from the session (Active, first payment Paid, next $5.00 due 22 Oct). The API-key/portal path works on the rebased branch.
6. **Cancel now** from the seller dashboard (Subscriptions → the subscription → Actions → Cancel subscription → "Now"). Canceled at 17:37 UTC.
7. **/pricing reloaded**: Subscribe buttons back. Pro off.
8. **Notification log**, all Delivered: customer.created (17:31), subscription.created and subscription.activated (17:33), subscription.updated and subscription.canceled (17:37). `subscription.updated` needed **2 attempts**: first answer `500 {"error":"Internal error"}` at 17:37, retry `200 {"received":true,"result":"applied"}` at 17:38. That's the webhook's documented behaviour — updated and canceled arrived in the same second and raced on the same Creator row; the loser answers 500 so Paddle retries; the retry applied. Outcome correct.

## Things seen along the way

- The checkout overlay is branded **"Yanshuf Studio"** now (it was OrZarua on 15 Sep). The 15 Sep gotcha is closed.
- The sandbox product is still named "Pub Quiz Pro"; the live product must be "TriviaFoundry Pro" (gate item 4).
- The subscription page in the seller dashboard shows `creatorId` and `creatorSig` under custom data — handy for support later.
- Paddle's sandbox dashboard subscriptions list lives at `/subscriptions-v2` (the sidebar link); `/subscriptions` is a 404.
- **privlin+paddle@gmail.com's production row now carries sandbox Paddle ids** (customer + a canceled subscription) — the second sandbox-origin row in production, alongside `cmu2qdlry…`. Never use that address for a live purchase; the never-used Google account stays for the paid walk. Post-launch cleanup.
- If the merged-row race is ever worth removing: the retry covers it, but a `Prisma.TransactionIsolationLevel.Serializable` or a per-creator advisory lock would avoid the 500 in the first place. Not needed for launch.

## Gate status after this walk

1. Sandbox walk: **passed** (this file).
2. Generate walk: passed 22 Sep (`claude/handoff-2026-09-23.md`).
3. #25 and #31 merged, live /pricing $45 without "no account": done.
4. **Live Paddle catalogue and the six Production variables: not done.** Paul does it Thu 24 Sep after his client call.
5. #24, #26, #27, #28, #29 merged or held: done.

Planning's ruling (22 Sep evening): item 4 missing at the Wed 17:00 gate means the walk sitting is **Mon 28 Sep, Tue 29 fallback** — not Thursday, not Friday. Master frozen until then. The Upstash screenshot is due before Monday's walk.
