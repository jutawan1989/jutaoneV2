import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Navbar } from "@/components/navbar";
import { TopUpPanel } from "@/components/topup-panel";
import { resolveVariant } from "@/lib/analytics/variant";
import { detectRegion } from "@/lib/geo";
import { getDictionary } from "@/lib/i18n";
import { isLocale } from "@/lib/i18n/config";
import { curlecConfigured } from "@/lib/payment/curlec";
import { formatTokenCount, getPrice, parseTopUpAmount, withUsdAmount } from "@/lib/pricing";
import { identifyVisitor } from "@/lib/trial/visitor";

type TopUpPageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ ref?: string; mode?: string; status?: string; amount?: string }>;
};

export default async function TopUpPage({ params, searchParams }: TopUpPageProps) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const [{ ref: reference, status, amount }, requestHeaders] = await Promise.all([
    searchParams,
    headers(),
  ]);

  const dict = getDictionary(locale);
  const region = detectRegion(requestHeaders);
  const base = getPrice(region, locale);
  const usd = parseTopUpAmount(amount) ?? 1;
  const price = withUsdAmount(base, usd, locale);
  const visitor = identifyVisitor(requestHeaders);
  const variant = resolveVariant(visitor.visitorKey);

  const showSimulator = !curlecConfigured() && process.env.NODE_ENV !== "production";

  return (
    <>
      <Navbar locale={locale} dict={dict} price={price} pathSuffix="/topup" />
      <main id="main" className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
        <TopUpPanel
          locale={locale}
          variant={variant}
          dict={dict}
          priceDisplay={`${price.display} ${price.baseCode}`}
          priceLocal={price.localDisplay}
          tokensDisplay={formatTokenCount(price.tokens, locale)}
          tokenName={price.tokensLabel[locale]}
          reference={reference ?? null}
          status={status ?? null}
          showSimulator={showSimulator}
        />
      </main>
    </>
  );
}
