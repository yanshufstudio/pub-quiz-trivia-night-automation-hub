/**
 * Captures real, in-browser screenshots of the app for the README / portfolio
 * section. Not a Playwright *test* — it's a standalone script that drives a
 * throwaway dev server + Chromium and writes actual PNG files to disk, so it
 * intentionally lives outside e2e/ (which is testDir for `npm run test:e2e`)
 * and is never picked up by CI.
 *
 * Usage: npm run screenshots
 */
import { chromium, devices, type Page } from "@playwright/test";
import { spawn, execSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const PORT = 4518;
const BASE_URL = `http://localhost:${PORT}`;
const DB_PATH = path.resolve(ROOT, "prisma/screenshots.db");
const OUT_DIR = path.resolve(ROOT, "docs/screenshots");

function log(msg: string) {
  console.log(`[screenshots] ${msg}`);
}

async function waitForServer(url: string, timeoutMs: number) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Server at ${url} did not become ready within ${timeoutMs}ms`);
}

/**
 * Signs `page`'s browser context in as a host.
 *
 * Every screenshot below /create and /packs is a host surface now, so the
 * script has to hold a session the same way a person does: ask for a magic
 * link, read it back from the throwaway server's own inbox, follow it.
 */
async function signIn(page: Page, email: string) {
  const res = await fetch(`${BASE_URL}/api/auth/sign-in/magic-link`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, callbackURL: "/packs", errorCallbackURL: "/sign-in" }),
  });
  if (!res.ok) throw new Error(`sign-in request failed: ${res.status} ${await res.text()}`);

  const inbox = await fetch(`${BASE_URL}/api/test/sign-in-links`);
  if (!inbox.ok) throw new Error(`sign-in link inbox is closed: ${inbox.status}`);
  const { links } = (await inbox.json()) as { links: { email: string; url: string }[] };
  const link = links.filter((l) => l.email === email).at(-1);
  if (!link) throw new Error(`no sign-in link was captured for ${email}`);

  await page.goto(link.url);
  await page.waitForURL(/\/packs/);
  log(`signed in as ${email}`);
}

async function shot(page: Page, name: string) {
  const file = path.join(OUT_DIR, name);
  await page.screenshot({ path: file });
  log(`saved ${path.relative(ROOT, file)}`);
}

async function main() {
  // --- fresh throwaway DB, migrated ---
  if (existsSync(DB_PATH)) rmSync(DB_PATH);
  if (existsSync(`${DB_PATH}-journal`)) rmSync(`${DB_PATH}-journal`);
  mkdirSync(OUT_DIR, { recursive: true });

  // SIGN_IN_LINK_CAPTURE turns on the in-memory inbox this script reads the
  // host's magic link out of (see src/lib/sign-in-email.ts). It needs
  // RESEND_API_KEY unset as well, and it cannot be switched on in production
  // at all — the whole gate is in `linkCaptureEnabled`.
  const dbEnv = {
    ...process.env,
    DATABASE_URL: `file:${DB_PATH}`,
    SIGN_IN_LINK_CAPTURE: "1",
    RESEND_API_KEY: "",
    BETTER_AUTH_SECRET: "screenshots-script-secret-not-used-anywhere-else",
    BETTER_AUTH_URL: BASE_URL,
  };
  log("running prisma migrate deploy against a throwaway screenshots.db");
  execSync("npx prisma migrate deploy", { cwd: ROOT, env: dbEnv, stdio: "inherit" });

  // --- start a dedicated dev server ---
  log(`starting next dev on port ${PORT}`);
  const server: ChildProcess = spawn("npm", ["run", "dev", "--", "-p", String(PORT)], {
    cwd: ROOT,
    env: dbEnv,
    stdio: "ignore",
    // npm resolves to npm.cmd on Windows; spawn() only finds it via a shell.
    shell: true,
  });

  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp || server.pid == null) return;
    cleanedUp = true;
    if (process.platform === "win32") {
      // server was spawned with shell:true (npm.cmd needs a shell to
      // resolve on Windows), so server.kill() only kills the cmd.exe
      // wrapper — the actual `next dev` grandchild survives it and leaks
      // a listening port. /T kills the whole process tree instead.
      try {
        execSync(`taskkill /PID ${server.pid} /T /F`, { stdio: "ignore" });
      } catch {
        // already dead — fine
      }
    } else {
      server.kill();
    }
  };
  process.on("exit", cleanup);

  try {
    await waitForServer(BASE_URL, 60_000);
    log("server is up");

    // PW_CHROMIUM_PATH lets a sandbox with a preinstalled Chromium (but no
    // `playwright install`) point at it; unset, Playwright uses its own.
    const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined });

    // Desktop context — landing, wizard, editor, print preview, host dashboard.
    const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const host = await desktop.newPage();

    await host.goto(`${BASE_URL}/`);
    await shot(host, "01-landing.png");

    await signIn(host, "screenshots@triviafoundry.example");

    await host.goto(`${BASE_URL}/create`);
    // The free-tier usage line is fetched client-side after mount; wait for
    // it so the screenshot shows the wizard in its real, settled state.
    await host.getByText(/free packs used in the last 30 days/).waitFor();
    await shot(host, "02-create-wizard.png");

    // Seed a demo pack and open the editor. No Anthropic key needed, but the
    // route is host-side now, so it goes through the signed-in browser
    // context rather than a bare fetch.
    const seedRes = await host.request.post(`${BASE_URL}/api/packs/seed`);
    if (!seedRes.ok()) throw new Error(`seed failed: ${seedRes.status()} ${await seedRes.text()}`);
    const { pack } = (await seedRes.json()) as { pack: { id: string } };

    await host.goto(`${BASE_URL}/packs/${pack.id}`);
    await shot(host, "03-pack-editor.png");

    await host.goto(`${BASE_URL}/packs/${pack.id}/print?type=questions`);
    await shot(host, "04-print-preview.png");

    // Start a live session from the editor.
    await host.goto(`${BASE_URL}/packs/${pack.id}`);
    await host.getByRole("button", { name: "Start live session" }).click();
    await host.waitForURL(/\/host\//);
    const code = host.url().split("/host/")[1];
    // The desk renders "Loading host desk…" until its first poll lands; the
    // lobby's QR code is the last thing to appear, so wait for that.
    await host.getByRole("img", { name: "Scan to join" }).waitFor();
    await shot(host, "05-host-lobby.png");

    // Mobile context — the team portal, as a phone-shaped viewport.
    const mobile = await browser.newContext({ ...devices["iPhone 13"] });
    const team = await mobile.newPage();
    await team.goto(`${BASE_URL}/play`);
    await team.getByLabel("Session code").fill(code);
    await team.getByLabel("Team name").fill("Quiz Pigs");
    await team.getByRole("button", { name: "Join session" }).click();
    await shot(team, "06-team-join.png");

    await host.waitForSelector('button:has-text("Start quiz"):not([disabled])', { timeout: 10_000 });
    await host.getByRole("button", { name: "Start quiz" }).click();
    await host.waitForSelector("text=What is the capital of Australia?");
    await shot(host, "07-host-question-live.png");

    await team.waitForSelector("text=What is the capital of Australia?", { timeout: 10_000 });
    await team.getByLabel("Your answer").fill("Canberra");
    await shot(team, "08-team-answer.png");
    await team.getByRole("button", { name: "Submit answer" }).click();

    await host.waitForSelector("text=1/1", { timeout: 10_000 });
    await shot(host, "09-host-live-submission.png");

    await host.getByRole("button", { name: "Reveal answer" }).click();
    // "Canberra" alone is already on screen pre-reveal (the live-submissions
    // panel shows raw answer text as soon as it's submitted); only the
    // "Answer: …" box is gated on the host having actually revealed.
    await host.waitForSelector("text=Answer: Canberra");
    await shot(host, "10-host-reveal-scoreboard.png");

    await team.waitForSelector("text=/Correct/", { timeout: 10_000 });
    await shot(team, "11-team-reveal.png");

    await browser.close();
    log(`done — ${OUT_DIR}`);
  } finally {
    cleanup();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
