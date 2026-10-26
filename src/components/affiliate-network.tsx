import type { AffiliateSummary } from "@/lib/affiliate";

function money(minor: number, currency: string): string {
  const value = minor / 100;
  if (currency === "IDR") return `Rp${value.toLocaleString("id-ID")}`;
  return `RM${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * The 19-level network table.
 *
 * Levels with zero people are still shown but dimmed: hiding them makes the
 * matrix look shorter than it is, and a member cannot tell whether level 12 is
 * empty or simply not modelled. The percentage column is the published rate, so
 * a member can verify their own payout without trusting the total.
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
      <main className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
        <header className="border-b border-line pb-6">
          <p className="text-[11px] font-medium tracking-[0.12em] text-muted uppercase">
            Kuda Merah
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-[-0.02em] text-white">
            Rangkaian afiliasi
          </h1>
        </header>

        {requestedCode ? (
          <section className="card mt-6 p-6">
            <p className="text-[11px] font-medium tracking-[0.12em] text-amber-300 uppercase">
              Kod tidak dijumpai
            </p>
            <p className="mt-2.5 text-sm leading-relaxed text-silver">
              Kod <span className="font-mono text-white">{requestedCode}</span>{" "}
              {invalidCode ? "tidak sah atau tiada rangkaian." : "tiada rangkaian."}
            </p>
            <p className="mt-2 text-xs text-muted">
              Semak ejaan kod anda, atau buka dashboard ini dari peranti yang sama anda mendaftar.
            </p>
          </section>
        ) : (
          <section className="card mt-6 p-6">
            <p className="text-sm leading-relaxed text-silver">
              Anda belum mempunyai kod afiliasi. Kongsi pautan jemputan anda untuk mula membina
              rangkaian sehingga 19 level.
            </p>
            <p className="mt-3 text-xs leading-relaxed text-muted">
              Level 1 dibayar 50% daripada setiap pembelian, level 2–19 berkongsi 20%, dan 5%
              dimasukkan ke tabung pencapaian.
            </p>
          </section>
        )}
      </main>
    );
  }

  const activeLevels = summary.levels.filter((level) => level.people > 0);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
      <header className="border-b border-line pb-6">
        <p className="text-[11px] font-medium tracking-[0.12em] text-muted uppercase">
          Kuda Merah
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-[-0.02em] text-white">
          Rangkaian afiliasi
        </h1>
        <p className="mt-2 text-sm text-muted">
          Kod anda: <span className="font-mono text-silver">{summary.code}</span>
        </p>
      </header>

      <section aria-label="Ringkasan" className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="card p-4">
          <p className="text-[11px] tracking-[0.1em] text-muted uppercase">Jaringan</p>
          <p className="mt-1.5 text-xl font-semibold text-white tabular-nums">
            {summary.totalPeople}
          </p>
          <p className="mt-0.5 text-[11px] text-muted">orang di semua level</p>
        </div>
        <div className="card p-4">
          <p className="text-[11px] tracking-[0.1em] text-muted uppercase">Pasif (L2–L19)</p>
          <p className="mt-1.5 text-xl font-semibold text-white tabular-nums">
            {money(summary.passiveMinor, summary.currency)}
          </p>
          <p className="mt-0.5 text-[11px] text-muted">
            langsung L1: {money(summary.directMinor, summary.currency)}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-[11px] tracking-[0.1em] text-muted uppercase">Boleh dikeluarkan</p>
          <p className="mt-1.5 text-xl font-semibold text-emerald-300 tabular-nums">
            {money(summary.availableMinor, summary.currency)}
          </p>
          <p className="mt-0.5 text-[11px] text-muted">selepas pembayaran tertunda</p>
        </div>
      </section>

      <section aria-label="Struktur rangkaian" className="mt-8">
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-semibold text-white">Struktur 19 level</h2>
          <p className="text-[11px] text-muted">{activeLevels.length} level aktif daripada 19</p>
        </div>

        <div className="card mt-3 overflow-hidden">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[10px] tracking-[0.1em] text-muted uppercase">
                <th scope="col" className="px-4 py-2.5 font-medium">Level</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">Orang</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">Kadar</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">Pendapatan</th>
              </tr>
            </thead>
            <tbody>
              {summary.levels.map((level) => {
                const empty = level.people === 0;
                return (
                  <tr
                    key={level.level}
                    className={`border-b border-line/50 last:border-b-0 ${empty ? "opacity-45" : ""}`}
                  >
                    <td className="px-4 py-2 text-silver">
                      Level {level.level}
                      {level.level === 1 && (
                        <span className="ml-1.5 text-[10px] text-brand">langsung</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right text-white tabular-nums">
                      {level.people}
                    </td>
                    <td className="px-4 py-2 text-right text-muted tabular-nums">
                      {level.percent}%
                    </td>
                    <td className="px-4 py-2 text-right text-silver tabular-nums">
                      {level.earnedMinor > 0 ? money(level.earnedMinor, summary.currency) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="mt-3 text-[11px] leading-relaxed text-muted/80">
          Level 1 dibayar 50%, level 2–19 berkongsi 20%, dan 5% dimasukkan ke tabung pencapaian.
          Jumlah 70%; syarikat menyimpan 30%. Baris kosong menunjukkan level yang belum diisi.
        </p>
      </section>
    </main>
  );
}
