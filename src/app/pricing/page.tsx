import { SiteHeader } from "@/components/SiteHeader";
import { getCreatorForPage } from "@/lib/creator";
import { PricingCards } from "./PricingCards";
import { ManageSubscriptionButton } from "./ManageSubscriptionButton";

export const dynamic = "force-dynamic";

export default async function PricingPage() {
  const creator = await getCreatorForPage();
  const isPro = creator?.plan === "PRO";

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-10">
        <h1 className="font-serif text-3xl font-semibold tracking-tight">Go Pro</h1>
        <p className="mt-2 text-muted">
          Free accounts get two AI-generated packs every 30 days. Pro removes the cap.
        </p>
        {isPro ? (
          <section className="mt-8 rounded-2xl border border-line bg-white p-6">
            <p className="font-medium">You are on Pro. Thank you.</p>
            <p className="mt-1 text-sm text-muted">
              Invoices, payment method and cancellation live in the billing portal.
            </p>
            <ManageSubscriptionButton />
          </section>
        ) : (
          <PricingCards
            creatorId={creator?.id ?? null}
            env={process.env.NEXT_PUBLIC_PADDLE_ENV === "production" ? "production" : "sandbox"}
            clientToken={process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN ?? ""}
            priceMonthly={process.env.NEXT_PUBLIC_PADDLE_PRICE_MONTHLY ?? ""}
            priceAnnual={process.env.NEXT_PUBLIC_PADDLE_PRICE_ANNUAL ?? ""}
          />
        )}
      </main>
    </>
  );
}
