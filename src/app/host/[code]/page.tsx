import { requireHostPage } from "@/lib/auth-guard";
import { HostDashboard } from "./HostDashboard";

export default async function HostPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  // Running the night is a host action. The per-session host token
  // (src/lib/host-auth.ts) still decides *which* session this browser may
  // drive — that check is unchanged and is what keeps a team who knows the
  // join code out of the desk. This one only establishes that a host is
  // signed in at all.
  await requireHostPage(`/host/${code}`);
  return <HostDashboard code={code.toUpperCase()} />;
}
