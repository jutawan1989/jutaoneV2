import { headers } from "next/headers";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { AdGenerator } from "@/components/ad-generator";
import { Billboard } from "@/components/billboard";
import {
  BeforeAfter,
  CaseStudies,
  LiveActivityToast,
  ValueStacking,
} from "@/components/conversion";
import { Footer } from "@/components/footer";
import { GoldWidget } from "@/components/gold-widget";
import { BizMatchSection } from "@/components/earn-sections";
import { Hero } from "@/components/hero";
import { Navbar } from "@/components/navbar";
import { Pricing } from "@/components/pricing";
import { WhySection } from "@/components/why-section";
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
  const price = getPrice(region, locale);
  const visitor = identifyVisitor(requestHeaders);
  const jar = await cookies();
  const sessionOwner = verifySession(jar.get(SESSION_COOKIE)?.value);
  const signedIn = sessionOwner !== null;
  // Members are recognised by their ledger identity from the session cookie,
  // so a shared IP or cleared visitor cookie never eats their quota.
  const quotaIdentity = signedIn
    ? { ...visitor, visitorKey: sessionOwner as string }
    : visitor;
  const variant = resolveVariant(quotaIdentity.visitorKey, variantOverride ?? null);

  const [access, killSwitch] = await Promise.all([
    evaluateDemoAccess(quotaIdentity),
    getKillSwitchState(),
  ]);

  const tokenName = price.tokensLabel[locale];

  // Dark Slate Blue body (Boss + Linda spec): every body section matches
  // the Hero — #0A0F1D surfaces, white text, dark cards with subtle borders.
  // Affiliate stays off the public homepage (Chip.Asia compliance).
  return (
    <>
      <Navbar locale={locale} dict={dict} price={price} signedIn={signedIn} />
      <main id="main">
        <Hero dict={dict} price={price} locale={locale} />
        <div className="bg-[#0A0F1D] text-slate-100">
          <BeforeAfter locale={locale} />
          <Billboard dict={dict} />
          <AdGenerator
            locale={locale}
            dict={dict}
            variant={variant}
            priceDisplay={price.display}
            currency={price.currency}
            tokenName={tokenName}
            initialRemaining={signedIn ? DAILY_GENERATION_QUOTA : access.remaining}
            initialCopyAllowed={signedIn ? true : access.copyAllowed}
            initialUsed={signedIn ? 0 : access.used}
            maxAttempts={DAILY_GENERATION_QUOTA}
            demoDisabled={killSwitch.disabled}
          />
          <GoldWidget dict={dict} locale={locale} />
          <CaseStudies locale={locale} />
          <BizMatchSection dict={dict} />
          <WhySection dict={dict} />
          <ValueStacking locale={locale} />
          <Pricing locale={locale} dict={dict} price={price} variant={variant} />
        </div>
      </main>
      <LiveActivityToast locale={locale} />
      <Footer locale={locale} dict={dict} />
    </>
  );
}
