// Shown while the host page checks the sign-in and streams in. Dark, like the
// desk it stands in for — see .stage-surface in globals.css.
import { getT } from "@/i18n";
import { pageLanguage } from "@/i18n/page-language";

export default async function Loading() {
  const t = getT(await pageLanguage());
  return (
    <div className="stage-surface flex min-h-dvh items-center justify-center bg-stage text-stage-muted">
      {t("desk.loading")}
    </div>
  );
}
