import { test, expect } from "@playwright/test";
import { newAnonContext, signedInContext } from "./sign-in-helper";

// The tie-safe naming logic (topScorers/winningNames) is unit tested at the
// function level in src/lib/scoreboard-summary.test.ts, but nothing before
// this exercised it through the actual ENDED screen with two real teams
// genuinely tied for first — this closes that gap.
//
// The quiz itself is driven through the API rather than by clicking through
// all six questions in three browsers. Every UI transition is delivered by a
// 3-second poll, so a click-driven run spent 20-25s waiting on polls alone
// and tripped the 30s test timeout roughly one run in four. The screens under
// test here are the ENDED screens, and those still render through the real
// polling clients below.
test("two teams tied for first both see the champions treatment, named together", async ({
  browser,
  baseURL,
}) => {
  // The desk is a host page, so the browser that drives it needs a session;
  // the API context below shares it.
  const { context: hostContext, api } = await signedInContext(browser, baseURL!);
  const seedRes = await api.post("/api/packs/seed");
  const { pack } = (await seedRes.json()) as {
    pack: { id: string; rounds: { questions: { answer: string }[] }[] };
  };
  const questions = pack.rounds.flatMap((round) => round.questions);
  expect(questions.length).toBeGreaterThan(1);

  const sessionRes = await api.post("/api/sessions", { data: { packId: pack.id } });
  const { session, hostToken } = await sessionRes.json();
  const code = session.code;

  const hostPage = await hostContext.newPage();
  await hostPage.addInitScript(
    ({ code, hostToken }) => {
      localStorage.setItem("quiz-hub:host-tokens", JSON.stringify({ [code]: hostToken }));
    },
    { code, hostToken }
  );
  await hostPage.goto(`/host/${code}`);

  const teamAContext = await newAnonContext(browser);
  const teamA = await teamAContext.newPage();
  await teamA.goto("/play");
  await teamA.getByLabel("Session code").fill(code);
  await teamA.getByLabel("Team name").fill("Quiz Pigs");
  await teamA.getByRole("button", { name: "Join session" }).click();
  await teamA.getByText("Sit tight.").waitFor();

  const teamBContext = await newAnonContext(browser);
  const teamB = await teamBContext.newPage();
  await teamB.goto("/play");
  await teamB.getByLabel("Session code").fill(code);
  await teamB.getByLabel("Team name").fill("Trivia Titans");
  await teamB.getByRole("button", { name: "Join session" }).click();
  await teamB.getByText("Sit tight.").waitFor();

  // The portal stores each team's token on join; reuse it to answer via API.
  const readToken = (page: typeof teamA) =>
    page.evaluate(() => (JSON.parse(localStorage.getItem("quiz-hub:team")!) as { token: string }).token);
  const tokenA = await readToken(teamA);
  const tokenB = await readToken(teamB);

  const advance = async (action: "start" | "reveal" | "next") => {
    const res = await api.post(`/api/sessions/${code}/advance`, { data: { action, hostToken } });
    expect(res.ok(), `advance ${action}: ${res.status()}`).toBeTruthy();
  };
  const answer = async (token: string, text: string) => {
    const res = await api.post(`/api/sessions/${code}/answers`, { data: { token, text } });
    expect(res.ok(), `answer "${text}": ${res.status()}`).toBeTruthy();
  };

  // Both teams answer every question correctly, so they stay tied all the
  // way to the end rather than just tying on question one.
  await advance("start");
  for (const question of questions) {
    await answer(tokenA, question.answer);
    await answer(tokenB, question.answer);
    await advance("reveal");
    await advance("next");
  }

  await expect(hostPage.getByText("Tonight’s champions")).toBeVisible({ timeout: 10_000 });
  await expect(hostPage.getByRole("heading", { name: "Quiz Pigs & Trivia Titans" })).toBeVisible();

  await expect(teamA.getByText("You tied for the win!")).toBeVisible({ timeout: 10_000 });
  await expect(teamA.getByRole("heading", { name: "Champions, Quiz Pigs!" })).toBeVisible();

  await expect(teamB.getByText("You tied for the win!")).toBeVisible({ timeout: 10_000 });
  await expect(teamB.getByRole("heading", { name: "Champions, Trivia Titans!" })).toBeVisible();

  await hostContext.close();
  await teamAContext.close();
  await teamBContext.close();
  await hostContext.close();
});
