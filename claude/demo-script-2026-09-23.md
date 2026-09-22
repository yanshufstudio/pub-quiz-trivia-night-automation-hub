# Demo script: client call, Wednesday 23 September 2026

Rehearsed on production on the evening of Tue 22 Sep (≈20:00 Israel time) from the built-in browser, signed in as yanshufapps@gmail.com. Everything below was clicked, not assumed. Nothing was generated: **yanshufapps still has one free pack left**, and privlin@gmail.com has none.

## What the rehearsal proved

- Editing: changing a field and tabbing out shows a small **"Saved"** label next to the question. (Q1 of the walk pack now has the alternate answer "Pulp (band)" — harmless, left in.)
- Print preview: `/packs/<id>/print` has three tabs — **Presenter script**, **Answer sheet**, **Question sheet** — and a **Download PDF** button top right.
- Live session: *Start live session* takes about three seconds ("Starting…"), then shows the lobby with a **QR code** and the link `triviafoundry.com/play?code=XXXXX`. Scanning the QR pre-fills the code on the phone; the team only types a name.
- The team appears on the host desk the moment it joins, no refresh. Questions push to the phone instantly on *Next question*.
- Auto-marking is case-insensitive ("i will always love you" scored +1 against "I Will Always Love You").
- Override: a wrong-marked answer ("Jarvis Cocker's band" for Pulp) became **+1** with one tap on *Correct*; the phone updated to "CORRECT · +1" and the scoreboard to 1.
- Rounds run straight into each other — no round-break screen between the last question of round 1 and the first of round 2.
- The last question's button reads **End quiz**; the host desk then shows **"Tonight's champion"** with a trophy and the final standings, and the phone shows **"YOU WON! Champions, Quizards!"** with final scores.
- Two sessions can run at once, and an abandoned session does not block starting a fresh one on the same pack (a new code is issued every time).

## Two gotchas to know before the call

1. **The phone remembers the last session.** If a phone joined any session earlier (a rehearsal, say), opening `/play` — even with a new `?code=` in the link — drops it straight back into the *old* session. Tap **Leave** (top right) first. After Leave, the form pre-fills the *old* code, not the one from the link, so retype the new code. Before the call: open triviafoundry.com/play on the demo phone and tap Leave if it isn't showing the join form.
2. **A 40-question pack never reaches the champion screen in a demo.** There is no "end early" control — *End quiz* only appears on the last question. If you want to show the trophy screen, run the live session on **Friday Night Demo Pack** (2 rounds, 6 questions, about a minute of clicking) rather than the walk pack. Use the walk pack for editing and print; use the demo pack for the live run. Or show the scoreboard mid-quiz and skip the ending.

## The path, step by step

Each step starts with the page it happens on.

1. `https://triviafoundry.com/packs` — signed in as yanshufapps. Show the two packs. Say: the free tier is two packs, no card.
2. `https://triviafoundry.com/create` — **only if you want to spend yanshufapps's last free pack.** Default brief, click Generate, "Generating…" for under a minute (measured 40 s on 22 Sep and 41 s on 14 Sep). If you'd rather keep the pack in reserve, skip this and open the existing walk pack instead; it's the output of exactly this step, generated at 15:23 UTC on 22 Sep.
3. `https://triviafoundry.com/packs/cmuctr1ye000004icvww1bs4f` — the walk pack, 4 rounds × 10. Show a round's title and category, edit one answer or alternate answer, tab out, point at "Saved". Optional: *Add image* on any question with one JPEG/PNG under 2 MB — **untested in the rehearsal** (the browser pane can't pick files); try it once on the laptop before the call. Say: "the wizard writes the text; pictures are yours to add — images, audio and video from the wizard are the next version."
4. `https://triviafoundry.com/packs/cmuctr1ye000004icvww1bs4f/print` — click through Presenter script → Answer sheet → Question sheet; click Download PDF if you want the file on screen.
5. `https://triviafoundry.com/packs/cmtqvu4f3000004l4pojdj0jv` — Friday Night Demo Pack. Leave the timer on "No timer (manual reveal)". Click **Start live session**. Wait ~3 s for the lobby with the QR.
6. On the phone: scan the QR (or type the five-character code at `https://triviafoundry.com/play`), enter a team name, **Join session**. Watch it appear under Teams on the laptop.
7. Laptop: **Start quiz**. Phone: type an answer, **Submit answer** (it can be changed until reveal). Laptop: **Reveal answer**, show the +1/0 against the submission, tap **Wrong** then **Correct** to show the override moving the scoreboard. **Next question.**
8. Repeat reveal/next through the six questions (get the phone to answer one or two so the score isn't zero). On question 6 the button becomes **End quiz** → "Tonight's champion" on the laptop, "YOU WON!" on the phone.
9. `https://triviafoundry.com/pricing` — Free vs Pro ($5 a month, $45 a year). There is no buy button yet, by design; the FAQ says "Pro subscriptions open shortly". Don't click around looking for a checkout.

## Don'ts

- Don't generate more than once on yanshufapps (one pack left); don't generate at all on privlin@gmail.com (used both).
- Don't open the walk-pack live session expecting to finish it — 40 questions.
- Don't let the phone join a second session without tapping Leave first.
- Keep the host tab open for the whole live run: the controls are tied to that browser.

## Left over from the rehearsal

Three abandoned sessions on production (PHD3C at Q2 of the walk pack, MMKAK ended, QJKH9 in lobby). They don't block anything; #30's retention cleanup will take them when it lands.
