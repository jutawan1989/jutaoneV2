import { headers } from "next/headers";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { AdGenerator } from "@/components/ad-generator";
import { Billboard } from "@/components/billboard";
import { Footer } from "@/components/footer";
import { GoldWidget } from "@/components/gold-widget";
import { Hero } from "@/components/hero";
import { Navbar } from "@/components/navbar";
import { Pricing } from "@/components/pricing";
import { getKillSwitchState } from "@/lib/ai/budget";
import { resolveVariant } from "@/lib/analytics/variant";
import { detectRegion } from "@/lib/geo";
import { getDictionary } from "@/lib/i18n";
import { isLocale } from "@/lib/i18n/config";
import { getPrice } from "@/lib/pricing";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/member";
import { DAILY_GENERATION_QUOTA, evaluateDemoAccess } from "@/lib/trial/limit";
import { identifyVisitor } from "@/lib/trial/visitor";

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ variant?: string }>;
};

export default async function HomePage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const [{ variant: variantOverride }, requestHeaders] = await Promise.all([
    searchParams,
    headers(),
  ]);

  const dict = getDictionary(locale);
  const region = detectRegion(requestHeaders);
  const price = getPrice(region);
  const visitor = identifyVisitor(requestHeaders);
  const variant = resolveVariant(visitor.visitorKey, variantOverride ?? null);

  const [access, killSwitch] = await Promise.all([
    evaluateDemoAccess(visitor),
    getKillSwitchState(),
  ]);

  const jar = await cookies();
  const signedIn = verifySession(jar.get(SESSION_COOKIE)?.value) !== null;

  const tokenName = price.tokensLabel[locale];

  return (
    <>
      <Navbar locale={locale} dict={dict} price={price} signedIn={signedIn} />
      <main id="main">
        <Hero dict={dict} price={price} locale={locale} />
        <Billboard dict={dict} />
        <AdGenerator
          locale={locale}
          dict={dict}
          variant={variant}
          priceDisplay={price.display}
          currency={price.currency}
          tokenName={tokenName}
          initialRemaining={access.remaining}
          initialCopyAllowed={access.copyAllowed}
          initialUsed={access.used}
          maxAttempts={DAILY_GENERATION_QUOTA}
          demoDisabled={killSwitch.disabled}
        />
        <GoldWidget dict={dict} />
        <Pricing locale={locale} dict={dict} price={price} variant={variant} />
      </main>
      <Footer locale={locale} dict={dict} />
    </>
  );
}
