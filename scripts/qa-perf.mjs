/**
 * LCP measurement under Slow 4G + 4x CPU throttling.
 *
 * A single cold run is noisy (the browser process, the server and the machine
 * all warm up at different times), so this takes several iterations per locale
 * and reports the median, which is the number that should be compared against
 * the 2.5s budget. Min and max are printed so the spread stays visible.
 *
 * Each iteration uses a fresh browser context: navigation cache, HTTP cache and
 * the LCP observer all start clean.
 */
import { chromium } from "playwright";

const baseUrl = process.env.SHOT_BASE_URL ?? "http://127.0.0.1:3220";
const iterations = Number(process.env.PERF_ITERATIONS ?? 3);
const budgetMs = 2500;

const COUNTRY = { ms: "MY", id: "ID", en: "SG" };

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

const browser = await chromium.launch();
const results = [];

for (const locale of ["ms", "id", "en"]) {
  const lcps = [];
  let transferKb = 0;
  let loadMs = 0;

  for (let run = 0; run < iterations; run += 1) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      extraHTTPHeaders: { "cf-ipcountry": COUNTRY[locale] },
    });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);

    // Slow 4G: 400 kbps down, 400 ms RTT, 4x CPU throttling.
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 400,
      downloadThroughput: (400 * 1024) / 8,
      uploadThroughput: (400 * 1024) / 8,
    });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });

    await page.addInitScript(() => {
      window.__lcp = 0;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) window.__lcp = entry.startTime;
      }).observe({ type: "largest-contentful-paint", buffered: true });
    });

    await page.goto(`${baseUrl}/${locale}`, { waitUntil: "load" });
    await page.waitForTimeout(3500);

    const metrics = await page.evaluate(() => {
      const navigation = performance.getEntriesByType("navigation")[0];
      return {
        lcp: Math.round(window.__lcp ?? 0),
        load: Math.round(navigation.loadEventEnd),
        transferKb: Math.round(
          performance
            .getEntriesByType("resource")
            .reduce((sum, entry) => sum + (entry.transferSize ?? 0), 0) / 1024,
        ),
      };
    });

    lcps.push(metrics.lcp);
    transferKb = metrics.transferKb;
    loadMs = metrics.load;
    await context.close();
  }

  results.push({
    locale,
    median: Math.round(median(lcps)),
    min: Math.min(...lcps),
    max: Math.max(...lcps),
    samples: lcps,
    loadMs,
    transferKb,
  });
}

await browser.close();

let failures = 0;
for (const result of results) {
  const ok = result.median < budgetMs;
  if (!ok) failures += 1;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${result.locale}: LCP median ${result.median}ms ` +
      `(min ${result.min} / max ${result.max}, n=${iterations}) ` +
      `| load ${result.loadMs}ms | ${result.transferKb}KB | budget ${budgetMs}ms`,
  );
}

console.log(
  `\n${results.length - failures}/${results.length} locales within budget (Slow 4G, 4x CPU, mobile)`,
);
if (failures > 0) process.exitCode = 1;
