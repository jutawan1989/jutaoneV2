import { notFound } from "next/navigation";
import { Footer } from "@/components/footer";
import { Navbar } from "@/components/navbar";
import { WaitlistForm } from "@/components/waitlist-form";
import { getDictionary } from "@/lib/i18n";
import { isLocale } from "@/lib/i18n/config";
import { getPrice } from "@/lib/pricing";

type WaitlistPageProps = { params: Promise<{ locale: string }> };

/**
 * Waitlist landing (Lead Ads destination for "NAK" clicks from social).
 * One form — Nama & Emel — posting to `/api/waitlist`, the contract the
 * Hermes backend will adopt for lead storage.
 */
export default async function WaitlistPage({ params }: WaitlistPageProps) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const dict = getDictionary(locale);
  const price = getPrice("OTHER", locale);

  return (
    <>
      <Navbar locale={locale} dict={dict} price={price} />
      <main id="main" className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
        <div className="mx-auto w-full max-w-lg">
          <div className="overflow-hidden rounded-2xl border border-[#2563EB]/40 bg-[#0B1220] p-6 shadow-[0_0_0_1px_#2563EB,0_8px_40px_-8px_rgba(37,99,235,0.45)] sm:p-10">
            <p className="text-center text-xs font-medium tracking-[0.12em] text-[#7AA5FF] uppercase">
              {dict.waitlist.eyebrow}
            </p>
            <h1 className="mt-3 text-center text-2xl font-semibold tracking-[-0.02em] text-white sm:text-3xl">
              {dict.waitlist.title}
            </h1>
            <p className="mt-3 text-center text-sm leading-relaxed text-slate-300">
              {dict.waitlist.subtitle}
            </p>
            <div className="mt-7">
              <WaitlistForm dict={dict} locale={locale} />
            </div>
          </div>
        </div>
      </main>
      <Footer locale={locale} dict={dict} />
    </>
  );
}
