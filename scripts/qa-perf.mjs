import { chromium } from "playwright";

const baseUrl = process.env.SHOT_BASE_URL ?? "http://127.0.0.1:3212";
const browser = await chromium.launch();

for (const locale of ["ms", "id", "en"]) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    extraHTTPHeaders: { "cf-ipcountry": locale === "ms" ? "MY" : locale === "id" ? "ID" : "SG" },
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);

  // Slow 4G: 400 kbps down, 400 ms RTT, plus 4x CPU throttling.
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
  await page.waitForTimeout(4000);

  const metrics = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    return {
      lcp: Math.round(window.__lcp ?? 0),
      domContentLoaded: Math.round(nav.domContentLoadedEventEnd),
      load: Math.round(nav.loadEventEnd),
      transferKb: Math.round(
        performance
          .getEntriesByType("resource")
          .reduce((sum, entry) => sum + (entry.transferSize ?? 0), 0) / 1024,
      ),
    };
  });

  console.log(
    `${locale}: LCP ${metrics.lcp}ms (target <2500) | DCL ${metrics.domContentLoaded}ms | load ${metrics.load}ms | ${metrics.transferKb}KB`,
  );
  await context.close();
}

await browser.close();
