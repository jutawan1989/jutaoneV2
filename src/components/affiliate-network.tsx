import type { AffiliateSummary } from "@/lib/affiliate";

function money(minor: number, currency: string): string {
  const value = minor / 100;
  if (currency === "IDR") return `Rp${value.toLocaleString("id-ID")}`;
  return `RM${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Affiliate program dashboard: professional referral summary.
 *
 * Compliance (Chip.Asia): no MLM-flavoured breakdown is shown here — only
 * aggregate referral counts and commission amounts, plus one plain-language
 * line explaining the commission. The per-level payout schedule lives in the
 * database, not in the UI.
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
              Dapatkan komisen tunai sehingga 70% daripada setiap pembelian software
              oleh rakan yang anda rujuk.
            </p>
          </section>
        )}
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

      <section aria-label="Penerangan komisen" className="card mt-6 p-5 sm:p-6">
        <h2 className="text-base font-semibold text-white">Bagaimana komisen berfungsi</h2>
        <p className="mt-2 max-w-prose text-sm leading-relaxed break-words text-silver">
          Dapatkan komisen tunai sehingga 70% daripada setiap pembelian software
          oleh rakan yang anda rujuk — 50% komisen langsung dan sehingga 20%
          daripada rangkaian anda. Kongsi pautan, selebihnya automatik.
        </p>
        <p className="mt-2 text-[11px] leading-relaxed break-words text-muted/80">
          Jumlah di atas dikemas kini automatik selepas setiap pembelian yang layak.
        </p>
      </section>
    </main>
  );
}
