import { requireHostPage } from "@/lib/auth-guard";
import { CreateWizard } from "./CreateWizard";

/**
 * The wizard itself is a client component (it drives a form and polls its own
 * allowance), so the gate lives in this server shell around it.
 *
 * It is not decoration. Generation costs real money and is counted against
 * the account's free allowance, so a browser that can render this page but
 * has no session would only get a 401 from
 * `POST /api/packs/generate` — after typing a brief. Redirecting here means
 * signing in happens before the work, not after it.
 */
export default async function CreatePage() {
  await requireHostPage("/create");
  return <CreateWizard />;
}
