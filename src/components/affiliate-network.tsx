import type { AffiliateSummary } from "@/lib/affiliate";
import {
  ACHIEVEMENT_BONUS_PERCENT,
  COMMISSION_LEVELS,
  MAX_COMMISSION_PERCENT,
} from "@/lib/affiliate";

function money(minor: number, currency: string): string {
  const value = minor / 100;
  if (currency === "IDR") return `Rp${value.toLocaleString("id-ID")}`;
  return `RM${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Affiliate program dashboard: professional referral summary.
 *
 * CTO final: 3-Level commission (L1 50% / L2 10% / L3 5%) + 5% Bonus
 * Pencapaian (max 70%). No 19-level / matrix breakdown is shown anywhere —
 * only aggregate counts, earned amounts, and this plain 3-level schedule.
 */
export function AffiliateNetwork({
  summary,
  requestedCode = null,
  invalidCode = false,
}: {
  summary: AffiliateSummary | null;
  /** The `?ref=` the visitor asked for, when one was supplied. */
  requestedCode?: string | null;
  /** True when the code was malformed or matched no network. */
  invalidCode?: boolean;
}) {
  const levelNames = ["Rujukan langsung", "Rangkaian Level 2", "Rangkaian Level 3"];

  const structure = (
    <section aria-label="Struktur komisen" className="card mt-6 p-5 sm:p-6">
      <p className="text-[11px] font-medium tracking-[0.12em] text-brand uppercase">
        Struktur Komisen 3-Level
      </p>
      <h2 className="mt-2 text-base font-semibold text-white">
        Jelas &amp; mudah — sehingga {MAX_COMMISSION_PERCENT}% komisen tunai
      </h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {COMMISSION_LEVELS.map((tier, index) => (
          <div
            key={tier.level}
            className={`relative overflow-hidden rounded-xl border p-4 ${
              index === 0
                ? "border-emerald-500/40 bg-emerald-500/[0.08]"
                : "border-white/[0.08] bg-white/[0.02]"
            }`}
          >
            <p className="text-[11px] font-medium tracking-[0.12em] text-muted uppercase">
              Level {tier.level}
            </p>
            <p className="mt-1 text-3xl font-semibold tracking-tight text-white tabular-nums">
              {tier.percent}
              <span className="text-lg text-muted">%</span>
            </p>
            <p className="mt-1 text-xs text-silver">{levelNames[index]}</p>
          </div>
        ))}
        <div className="relative overflow-hidden rounded-xl border border-amber-400/40 bg-amber-400/[0.07] p-4">
          <p className="text-[11px] font-medium tracking-[0.12em] text-amber-300 uppercase">
            Bonus Pencapaian
          </p>
          <p className="mt-1 text-3xl font-semibold tracking-tight text-white tabular-nums">
            {ACHIEVEMENT_BONUS_PERCENT}
            <span className="text-lg text-muted">%</span>
          </p>
          <p className="mt-1 text-xs text-silver">Ganjaran pencapaian jualan anda</p>
        </div>
      </div>
      <p className="mt-4 max-w-prose text-sm leading-relaxed text-silver">
        Setiap pembelian software oleh rakan yang anda rujuk membayar mengikut
        level mereka — Level 1: 50%, Level 2: 10%, Level 3: 5% — tambah Bonus
        Pencapaian 5%. Kongsi pautan, selebihnya automatik.
      </p>
      <p className="mt-2 text-[11px] leading-relaxed text-muted/80">
        Jumlah di atas dikemas kini automatik selepas setiap pembelian yang layak.
      </p>
    </section>
  );

  if (!summary) {
    return (
      <main className="mx-auto w-full max-w-3xl px-5 py-12 sm:px-6">
        <header className="border-b border-line pb-6">
          <p className="text-[11px] font-medium tracking-[0.12em] text-muted uppercase">
            Program Affiliate
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-[-0.02em] text-white">
            Rakan yang anda rujuk
          </h1>
        </header>

        {requestedCode ? (
          <section className="card mt-6 p-6">
            <p className="text-[11px] font-medium tracking-[0.12em] text-amber-300 uppercase">
              Kod tidak dijumpai
            </p>
            <p className="mt-2.5 text-sm leading-relaxed text-silver">
              Kod <span className="font-mono break-all text-white">{requestedCode}</span>{" "}
              {invalidCode ? "tidak sah atau tiada rekod." : "tiada rekod."}
            </p>
            <p className="mt-2 text-xs text-muted">
              Semak ejaan kod anda, atau buka dashboard ini dari peranti yang sama anda mendaftar.
            </p>
          </section>
        ) : (
          <section className="card mt-6 p-6">
            <p className="text-sm leading-relaxed text-silver">
              Anda belum mempunyai kod affiliate. Kongsi pautan jemputan anda untuk mula
              mengumpul rakan dirujuk dan komisen tunai.
            </p>
            <p className="mt-3 text-xs leading-relaxed text-muted">
              Dapatkan komisen tunai sehingga {MAX_COMMISSION_PERCENT}% — Level 1: 50%,
              Level 2: 10%, Level 3: 5%, tambah Bonus Pencapaian 5%.
            </p>
          </section>
        )}

        {structure}
      </main>
    );
  }

  const totalEarned = summary.directMinor + summary.passiveMinor;

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-12 sm:px-6">
      <header className="border-b border-line pb-6">
        <p className="text-[11px] font-medium tracking-[0.12em] text-muted uppercase">
          Program Affiliate
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-[-0.02em] text-white">
          Rakan yang anda rujuk
        </h1>
        <p className="mt-2 text-sm text-muted">
          Kod anda: <span className="font-mono break-all text-silver">{summary.code}</span>
        </p>
      </header>

      <section aria-label="Ringkasan" className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="card min-w-0 p-4">
          <p className="text-[11px] tracking-[0.1em] text-muted uppercase">Rakan dirujuk</p>
          <p className="mt-1.5 text-xl font-semibold break-all text-white tabular-nums">
            {summary.totalPeople}
          </p>
          <p className="mt-0.5 text-[11px] break-words text-muted">orang dalam rangkaian anda</p>
        </div>
        <div className="card min-w-0 p-4">
          <p className="text-[11px] tracking-[0.1em] text-muted uppercase">Komisen terkumpul</p>
          <p className="mt-1.5 text-xl font-semibold break-all text-white tabular-nums">
            {money(totalEarned, summary.currency)}
          </p>
          <p className="mt-0.5 text-[11px] break-words text-muted">
            langsung: {money(summary.directMinor, summary.currency)}
          </p>
        </div>
        <div className="card min-w-0 p-4">
          <p className="text-[11px] tracking-[0.1em] text-muted uppercase">Boleh dikeluarkan</p>
          <p className="mt-1.5 text-xl font-semibold break-all text-emerald-300 tabular-nums">
            {money(summary.availableMinor, summary.currency)}
          </p>
          <p className="mt-0.5 text-[11px] break-words text-muted">selepas pembayaran tertunda</p>
        </div>
      </section>

      {structure}
    </main>
  );
}
