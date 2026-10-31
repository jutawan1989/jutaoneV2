"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Locale } from "@/lib/i18n/config";

/* ------------------------------------------------------------------ */
/* Shared locale strings (kept local so dictionaries stay untouched)   */
/* ------------------------------------------------------------------ */

const T = {
  ms: {
    telemetryAds: "Iklan Dijana Hari Ini",
    tryPlaceholder: "Contoh: Kerepek Pisang RM10…",
    tryButton: "Cuba Sekarang",
    tryHint: "Taip produk anda — kami tulis iklan dalam 1.5 saat. ↓",
    beforeAfterEyebrow: "Perbandingan Jujur",
    beforeAfterTitle: "Cara Lama vs Cara JutaOne",
    beforeAfterSub: "Berhenti bazir masa & duit. Satu platform buat semua.",
    oldTitle: "❌ Cara Lama",
    oldItems: ["Perah Otak 2 Jam", "Upah Copywriter $320", "Guna 4 Software Berbeza"],
    newTitle: "JutaOne Way",
    newItems: ["Siap 1.5 Saat", "Hanya $1", "Semua Dalam Satu Platform"],
    newBadge: "Pilihan Peniaga",
    casesEyebrow: "Kajian Kes Sebenar",
    casesTitle: "3 Industri. 1 Hasil: Iklan Yang Menjual.",
    casesSub: "Lihat transformasi sebelum vs selepas guna JutaOne.Biz.",
    cases: [
      {
        tag: "Peniaga Makanan",
        before: "Kerepek pisang sedap. Boleh beli.",
        after: "🔥 KRUP KRAP VIRAL! Kerepek Pisang Rangup RM10 — Sekali Kunyah Confirm Repeat! Order Hari Ini, Esok Sampai! 🚚",
      },
      {
        tag: "Fesyen",
        before: "Baju kurung baru sudah sampai.",
        after: "✨ RAYA GLOW-UP! Baju Kurung Moden — Potongan Trendi, Kain Sejuk & Selesa. DM Sekarang, Stok Terhad! 👗",
      },
      {
        tag: "Servis",
        before: "Kami buat servis aircond.",
        after: "❄️ AIRCOND SEJUK MACAM BARU DALAM 45 MINIT! Servis Cuci Aircond RM80 — Area Shah Alam. Booking Slot Hari Ini! 📲",
      },
    ],
    valueEyebrow: "Tawaran Nilai",
    valueTitle: "Apa Yang Anda Dapat Dengan $1",
    agencyLabel: "Kos Agensi:",
    agencyPrice: "$320+",
    ourPrice: "Hanya $1",
    valueItems: [
      "AI Writer — Iklan TikTok/FB tanpa had gaya",
      "Auto-Store — Kedai online + invois PDF",
      "Biz-Match — Cari pembekal borong sebenar",
      "Metals Radar — Data harga emas & perak live",
    ],
    valueCta: "Claim $1 Sekarang →",
    valueNote: "Bayaran sekali. Tiada langganan. Tiada kontrak.",
  },
  en: {
    telemetryAds: "Ads Generated Today",
    tryPlaceholder: "E.g. Banana chips $2…",
    tryButton: "Try Now",
    tryHint: "Type your product — we write the ad in 1.5 seconds. ↓",
    beforeAfterEyebrow: "Honest Comparison",
    beforeAfterTitle: "Old Way vs JutaOne Way",
    beforeAfterSub: "Stop wasting time & money. One platform does it all.",
    oldTitle: "❌ Old Way",
    oldItems: ["2 Hours Brainstorming", "Hire Copywriter $320", "Juggle 4 Different Apps"],
    newTitle: "JutaOne Way",
    newItems: ["Done in 1.5 Seconds", "Only $1", "Everything In One Platform"],
    newBadge: "Merchants' Choice",
    casesEyebrow: "Real Case Studies",
    casesTitle: "3 Industries. 1 Result: Ads That Sell.",
    casesSub: "See the before vs after transformation with JutaOne.Biz.",
    cases: [
      {
        tag: "Food Seller",
        before: "Banana chips tasty. Can buy.",
        after: "🔥 VIRAL CRUNCH! Crispy Banana Chips $2 — One Bite & You're Hooked! Order Today! 🚚",
      },
      {
        tag: "Fashion",
        before: "New dresses have arrived.",
        after: "✨ GLOW-UP SALE! Modern Dress — Trendy Cut, Cool & Comfy Fabric. DM Now, Limited Stock! 👗",
      },
      {
        tag: "Services",
        before: "We do aircond servicing.",
        after: "❄️ ICE-COLD AIRCOND IN 45 MINUTES! Aircond Service $18 — Book Your Slot Today! 📲",
      },
    ],
    valueEyebrow: "Value Stack",
    valueTitle: "What You Get For $1",
    agencyLabel: "Agency Cost:",
    agencyPrice: "$320+",
    ourPrice: "Only $1",
    valueItems: [
      "AI Writer — unlimited TikTok/FB ad styles",
      "Auto-Store — online shop + PDF invoices",
      "Biz-Match — find real wholesale suppliers",
      "Metals Radar — live gold & silver prices",
    ],
    valueCta: "Claim $1 Now →",
    valueNote: "One-time payment. No subscription. No contract.",
  },
  id: {
    telemetryAds: "Iklan Dibuat Hari Ini",
    tryPlaceholder: "Cth: Keripik Pisang Rp15rb…",
    tryButton: "Coba Sekarang",
    tryHint: "Ketik produk Anda — kami tulis iklan dalam 1,5 detik. ↓",
    beforeAfterEyebrow: "Perbandingan Jujur",
    beforeAfterTitle: "Cara Lama vs Cara JutaOne",
    beforeAfterSub: "Berhenti buang waktu & uang. Satu platform untuk semua.",
    oldTitle: "❌ Cara Lama",
    oldItems: ["Pusing Otak 2 Jam", "Bayar Copywriter $320", "Pakai 4 Aplikasi Berbeda"],
    newTitle: "JutaOne Way",
    newItems: ["Jadi 1,5 Detik", "Hanya $1", "Semua Dalam Satu Platform"],
    newBadge: "Pilihan Pedagang",
    casesEyebrow: "Studi Kasus Nyata",
    casesTitle: "3 Industri. 1 Hasil: Iklan Yang Menjual.",
    casesSub: "Lihat transformasi sebelum vs sesudah pakai JutaOne.Biz.",
    cases: [
      {
        tag: "Pedagang Makanan",
        before: "Keripik pisang enak. Bisa beli.",
        after: "🔥 VIRAL! Keripik Pisang Renyah Rp15rb — Sekali Gigit Pasti Nagih! Order Hari Ini! 🚚",
      },
      {
        tag: "Fesyen",
        before: "Baju baru sudah datang.",
        after: "✨ GLOW-UP! Baju Modern — Potongan Trendi, Adem & Nyaman. DM Sekarang, Stok Terbatas! 👗",
      },
      {
        tag: "Jasa",
        before: "Kami servis AC.",
        after: "❄️ AC DINGIN KAYAK BARU 45 MENIT! Cuci AC Rp80rb — Booking Slot Hari Ini! 📲",
      },
    ],
    valueEyebrow: "Tumpukan Nilai",
    valueTitle: "Yang Anda Dapat Dengan $1",
    agencyLabel: "Biaya Agensi:",
    agencyPrice: "$320+",
    ourPrice: "Hanya $1",
    valueItems: [
      "AI Writer — Iklan TikTok/FB tanpa batas gaya",
      "Auto-Store — Toko online + faktur PDF",
      "Biz-Match — Cari supplier grosir asli",
      "Metals Radar — Data harga emas & perak live",
    ],
    valueCta: "Klaim $1 Sekarang →",
    valueNote: "Sekali bayar. Tanpa langganan. Tanpa kontrak.",
  },
} as const;

function strings(locale: Locale) {
  return T[locale] ?? T.ms;
}

/* ------------------------------------------------------------------ */
/* TASK 1a: Live Telemetry Counter                                     */
/* ------------------------------------------------------------------ */

const TELEMETRY_BASE = 12450;

export function LiveTelemetryCounter({ locale }: { locale: Locale }) {
  const s = strings(locale);
  const [count, setCount] = useState(TELEMETRY_BASE);
  useEffect(() => {
    const id = setInterval(() => {
      setCount((c) => c + 1 + Math.floor(Math.random() * 6));
    }, 2500);
    return () => clearInterval(id);
  }, []);
  return (
    <p
      aria-live="polite"
      className="inline-flex max-w-full min-w-0 items-center gap-2 rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-[11px] font-bold break-words text-red-200 tabular-nums sm:text-[12px]"
    >
      <span aria-hidden className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
      </span>
      🔥 {count.toLocaleString(locale === "en" ? "en-US" : locale === "id" ? "id-ID" : "ms-MY")} {s.telemetryAds}
    </p>
  );
}

/* ------------------------------------------------------------------ */
/* TASK 1b: Hero Try-Now box (dispatches prefill to #demo)             */
/* ------------------------------------------------------------------ */

export function HeroTryBox({ locale }: { locale: Locale }) {
  const s = strings(locale);
  const [value, setValue] = useState("");
  const submit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const v = value.trim();
      if (v.length < 2) {
        document.getElementById("demo")?.scrollIntoView({ behavior: "smooth" });
        return;
      }
      window.dispatchEvent(new CustomEvent<string>("jutaone:try-demo", { detail: v }));
      document.getElementById("demo")?.scrollIntoView({ behavior: "smooth" });
      window.setTimeout(() => document.getElementById("product")?.focus({ preventScroll: true }), 600);
    },
    [value],
  );
  return (
    <form
      onSubmit={submit}
      className="mt-6 w-full max-w-xl rounded-2xl border border-white/10 bg-black/40 p-2 shadow-[0_18px_50px_-18px_rgba(37,99,235,0.55)] backdrop-blur"
    >
      <div className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor="hero-try" className="sr-only">
          {s.tryButton}
        </label>
        <input
          id="hero-try"
          value={value}
          onChange={(e) => setValue(e.target.value.slice(0, 200))}
          placeholder={s.tryPlaceholder}
          maxLength={200}
          className="min-h-[52px] w-full flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white placeholder:text-white/40 focus:border-blue-500 focus:outline-none"
        />
        <button
          type="submit"
          className="btn-brand btn-glow min-h-[52px] shrink-0 rounded-xl px-6 text-[15px] font-bold whitespace-nowrap"
        >
          {s.tryButton} →
        </button>
      </div>
      <p className="px-2 pt-1.5 pb-0.5 text-[11px] text-white/55">{s.tryHint}</p>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* TASK 2: Before vs After comparison block                            */
/* ------------------------------------------------------------------ */

export function BeforeAfter({ locale }: { locale: Locale }) {
  const s = strings(locale);
  return (
    <section aria-label={s.beforeAfterTitle} className="border-t border-white/[0.06] bg-[#0A0F1D] py-12 sm:py-16">
      <div className="mx-auto w-full max-w-6xl px-5 sm:px-6">
        <p className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] font-medium tracking-[0.12em] text-white/60 uppercase">
          {s.beforeAfterEyebrow}
        </p>
        <h2 className="mt-4 text-2xl font-semibold tracking-[-0.02em] text-balance text-white sm:text-3xl">
          {s.beforeAfterTitle}
        </h2>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/60">{s.beforeAfterSub}</p>
        <div className="mt-7 grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-red-500/20 bg-[#14090d] p-5 sm:p-6">
            <p className="text-[11px] font-bold tracking-[0.14em] text-red-300/90 uppercase">{s.oldTitle}</p>
            <ul className="mt-4 space-y-3">
              {s.oldItems.map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-3 text-sm text-white/55 line-through decoration-red-500/50"
                >
                  <span aria-hidden className="mt-0.5 text-red-400">❌</span>
                  <span className="min-w-0">{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="relative overflow-hidden rounded-2xl border-2 border-blue-500/60 bg-[#0B1220] p-5 shadow-[0_24px_70px_-24px_rgba(59,130,246,0.6)] sm:p-6">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[radial-gradient(22rem_6rem_at_50%_0%,rgba(59,130,246,0.22),transparent_70%)]"
            />
            <div className="relative flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] font-bold tracking-[0.14em] text-sky-300 uppercase">✅ {s.newTitle}</p>
              <span className="rounded-full bg-blue-600 px-2.5 py-1 text-[10px] font-bold tracking-[0.08em] text-white uppercase shadow-[0_0_18px_rgba(37,99,235,0.7)]">
                {s.newBadge}
              </span>
            </div>
            <ul className="relative mt-4 space-y-3">
              {s.newItems.map((item) => (
                <li
                  key={item}
                  className="flex items-start gap-2.5 rounded-xl border border-blue-500/25 bg-blue-500/[0.08] px-3.5 py-3 text-sm font-semibold text-white"
                >
                  <span aria-hidden className="mt-0.5 text-emerald-300">✅</span>
                  <span className="min-w-0">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* TASK 4: Case studies (3 cards)                                      */
/* ------------------------------------------------------------------ */

export function CaseStudies({ locale }: { locale: Locale }) {
  const s = strings(locale);
  return (
    <section aria-label={s.casesTitle} className="border-t border-white/[0.06] bg-[#0A0F1D] py-12 sm:py-16">
      <div className="mx-auto w-full max-w-6xl px-5 sm:px-6">
        <p className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] font-medium tracking-[0.12em] text-white/60 uppercase">
          {s.casesEyebrow}
        </p>
        <h2 className="mt-4 max-w-2xl text-2xl font-semibold tracking-[-0.02em] text-balance text-white sm:text-3xl">
          {s.casesTitle}
        </h2>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/60">{s.casesSub}</p>
        <div className="mt-7 grid gap-4 md:grid-cols-3">
          {s.cases.map((c) => (
            <article
              key={c.tag}
              className="flex min-w-0 flex-col rounded-2xl border border-white/[0.07] bg-[#0B1220] p-5 ring-1 ring-white/[0.04] ring-inset"
            >
              <p className="inline-flex w-fit items-center rounded-full bg-blue-600/15 px-2.5 py-1 text-[11px] font-bold text-sky-300 ring-1 ring-blue-500/30 ring-inset">
                {c.tag}
              </p>
              <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/[0.06] p-3.5">
                <p className="text-[10px] font-bold tracking-[0.14em] text-red-300/80 uppercase">Before · Kaku</p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-white/55 italic">“{c.before}”</p>
              </div>
              <div
                aria-hidden
                className="mx-auto my-1 flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white shadow-[0_0_16px_rgba(37,99,235,0.8)]"
              >
                ↓
              </div>
              <div className="flex-1 rounded-xl border border-emerald-400/25 bg-emerald-400/[0.07] p-3.5">
                <p className="text-[10px] font-bold tracking-[0.14em] text-emerald-300 uppercase">After · Menggoda</p>
                <p className="mt-1.5 text-[13px] leading-relaxed font-medium text-white">“{c.after}”</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* TASK 5: Value-stacking checkout block                                */
/* ------------------------------------------------------------------ */

export function ValueStacking({ locale }: { locale: Locale }) {
  const s = strings(locale);
  return (
    <section aria-label={s.valueTitle} className="border-t border-white/[0.06] bg-[#0A0F1D] py-12 sm:py-16">
      <div className="mx-auto w-full max-w-6xl px-5 sm:px-6">
        <div className="relative overflow-hidden rounded-3xl border border-blue-500/40 bg-gradient-to-b from-[#0d1b3d] to-[#0B1220] p-6 text-center shadow-[0_30px_80px_-30px_rgba(37,99,235,0.65)] sm:p-10">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(30rem_8rem_at_50%_0%,rgba(59,130,246,0.25),transparent_70%)]"
          />
          <p className="relative inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.05] px-3 py-1 text-[11px] font-bold tracking-[0.14em] text-sky-200 uppercase">
            {s.valueEyebrow}
          </p>
          <h2 className="relative mx-auto mt-4 max-w-2xl text-2xl font-semibold tracking-[-0.02em] text-balance text-white sm:text-3xl">
            {s.valueTitle}
          </h2>
          <p className="relative mt-3 text-sm text-white/60">
            <span className="font-medium">{s.agencyLabel}</span>{" "}
            <s className="font-bold text-red-300/90 tabular-nums">{s.agencyPrice}</s>
          </p>
          <p className="relative mt-1 text-4xl leading-tight font-bold tracking-[-0.03em] break-words text-white tabular-nums sm:text-6xl">
            {s.ourPrice}
          </p>
          <ul className="relative mx-auto mt-6 grid max-w-2xl gap-2.5 text-left sm:grid-cols-2">
            {s.valueItems.map((item) => (
              <li
                key={item}
                className="flex items-start gap-2.5 rounded-xl border border-white/10 bg-black/30 px-3.5 py-3 text-[13px] font-medium text-white/90"
              >
                <span
                  aria-hidden
                  className="mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-[11px] ring-1 ring-emerald-400/40 ring-inset"
                >
                  ✓
                </span>
                <span className="min-w-0">{item}</span>
              </li>
            ))}
          </ul>
          <a
            href="#pricing"
            className="btn-brand btn-glow relative mx-auto mt-7 inline-flex min-h-[52px] items-center justify-center px-8 text-base font-bold"
          >
            {s.valueCta}
          </a>
          <p className="relative mt-3 text-[11px] text-white/55">{s.valueNote}</p>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* TASK 3: Live activity social-proof toast                             */
/* ------------------------------------------------------------------ */

const ACTIVITIES = [
  { name: "Ahmad", city: "Shah Alam", actionMs: "baru sahaja jana iklan Kerepek Pisang", actionEn: "just generated a Banana Chips ad", actionId: "baru saja buat iklan Keripik Pisang" },
  { name: "Siti", city: "Jakarta", actionMs: "baru sahaja Top-Up 1 Juta Token", actionEn: "just topped up 1 Million Tokens", actionId: "baru saja Top-Up 1 Juta Token" },
  { name: "Wei Lun", city: "Johor Bahru", actionMs: "baru sahaja jana iklan Servis Aircond", actionEn: "just generated an Aircond Service ad", actionId: "baru saja buat iklan Servis AC" },
  { name: "Rina", city: "Bandung", actionMs: "baru sahaja buka kedai online", actionEn: "just opened an online store", actionId: "baru saja buka toko online" },
  { name: "Farah", city: "Kuala Lumpur", actionMs: "baru sahaja jana iklan Tudung Satin", actionEn: "just generated a Satin Hijab ad", actionId: "baru saja buat iklan Hijab Satin" },
  { name: "Budi", city: "Surabaya", actionMs: "baru sahaja jumpa pembekal via Biz-Match", actionEn: "just found a supplier via Biz-Match", actionId: "baru saja ketemu supplier via Biz-Match" },
] as const;

export function LiveActivityToast({ locale }: { locale: Locale }) {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;
    let hideId: number | null = null;
    const schedule = () => {
      const delay = 10000 + Math.random() * 5000; // 10–15s
      timer.current = window.setTimeout(() => {
        if (!alive) return;
        setIndex((i) => (i + 1) % ACTIVITIES.length);
        setVisible(true);
        hideId = window.setTimeout(() => {
          if (alive) setVisible(false);
          schedule();
        }, 4500);
      }, delay);
    };
    // First toast appears quickly so Boss sees it in review.
    const first = window.setTimeout(() => {
      if (!alive) return;
      setVisible(true);
      hideId = window.setTimeout(() => {
        if (alive) setVisible(false);
        schedule();
      }, 4500);
    }, 3500);
    return () => {
      alive = false;
      window.clearTimeout(first);
      if (timer.current) window.clearTimeout(timer.current);
      if (hideId) window.clearTimeout(hideId);
    };
  }, []);

  if (!visible) return null;
  const a = ACTIVITIES[index % ACTIVITIES.length];
  const action = locale === "en" ? a.actionEn : locale === "id" ? a.actionId : a.actionMs;
  return (
    <div
      role="status"
      aria-live="polite"
      // Mobile-first: lifted above the bottom nav / chat FAB and stretched
      // full-width with side margins so it never covers CTAs on 375px phones.
      className="fixed right-3 bottom-[calc(6rem+env(safe-area-inset-bottom))] left-3 z-50 flex max-w-full items-start gap-2.5 rounded-2xl border border-white/10 bg-[#0B1220]/95 py-3 pr-2 pl-3.5 shadow-[0_18px_50px_-12px_rgba(0,0,0,0.7)] backdrop-blur sm:right-auto sm:bottom-6 sm:left-6 sm:max-w-sm sm:pr-3"
    >
      <span aria-hidden className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-sm ring-1 ring-emerald-400/40 ring-inset">
        🟢
      </span>
      <p className="min-w-0 flex-1 text-[13px] leading-snug text-white/90">
        <strong className="font-semibold text-white">{a.name}</strong>
        <span className="text-white/60"> dari {a.city} </span>
        {action}
      </p>
      <button
        type="button"
        onClick={() => setVisible(false)}
        aria-label="Close"
        className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-md text-sm text-white/40 transition-colors hover:text-white"
      >
        ✕
      </button>
    </div>
  );
}
