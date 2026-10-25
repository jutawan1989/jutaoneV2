import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const OUT = "C:\\Users\\lenovo\\OneDrive\\Documents\\Default Project\\jutaone-v2\\screenshots\\pricing\\live";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true,
});

/** Local preview shots: without cf-ipcountry the region falls back to
 *  accept-language, so this is how an Indonesian (Rp) and a Malaysian (RM)
 *  visitor each see the card. */
for (const [name, url, lang, label, expected] of [
  ["06-mobile-id-5usd.png", "http://localhost:3000/id", "id-ID", "$5", "$5.00"],
  ["06b-mobile-bm-50usd.png", "http://localhost:3000/ms", "ms-MY", "$50", "$50.00"],
]) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    locale: lang,
    extraHTTPHeaders: { "accept-language": lang },
    isMobile: true,
    hasTouch: true,
  });
  const p = await ctx.newPage();
  await p.goto(url, { waitUntil: "load", timeout: 120000 });
  await p.waitForSelector("#pricing", { timeout: 120000 });
  await p.addStyleTag({
    content: "nextjs-portal{display:none!important}header{display:none!important}",
  });
  // hydration check: the preset click must actually move the headline price
  await p.waitForFunction(
    async ({ label, expected }) => {
      const btn = [...document.querySelectorAll("#pricing button")].find(
        (b) => b.textContent.trim() === label,
      );
      if (!btn) return false;
      btn.click();
      await new Promise((r) => setTimeout(r, 250));
      return document.querySelector("#pricing").innerText.includes(expected);
    },
    { label, expected },
    { timeout: 60000 },
  );
  await p.waitForTimeout(700);
  const el = await p.$("#pricing");
  await el.scrollIntoViewIfNeeded();
  await p.waitForTimeout(400);
  await el.screenshot({ path: `${OUT}\\${name}` });
  console.log(
    "saved",
    name,
    "|",
    (await p.locator("#pricing .card").innerText()).replace(/\n+/g, " | ").slice(0, 240),
  );
  await ctx.close();
}

await browser.close();
