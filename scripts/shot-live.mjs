import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE = "https://jutaonev2.jutawan1989.workers.dev";
const OUT = "C:\\Users\\lenovo\\OneDrive\\Documents\\Default Project\\jutaone-v2\\screenshots\\pricing\\live";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });

/** Waits for React hydration by confirming a preset click changes the price. */
async function hydrate(p) {
  await p.waitForFunction(
    async () => {
      const btn = [...document.querySelectorAll("#pricing button")].find(
        (b) => b.textContent.trim() === "$5",
      );
      if (!btn) return false;
      btn.click();
      await new Promise((r) => setTimeout(r, 250));
      return document.querySelector("#pricing").innerText.includes("$5.00");
    },
    undefined,
    { timeout: 60000 },
  );
  // restore the $1 default so each shot starts from a known state
  await p.click('#pricing button:text-is("$1")');
  await p.waitForTimeout(300);
}

async function open({ width, height, url, lang, waitsForPricing = true }) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
    locale: lang,
    extraHTTPHeaders: { "accept-language": lang },
    isMobile: width < 600,
    hasTouch: width < 600,
  });
  const p = await ctx.newPage();
  await p.goto(url, { waitUntil: "load", timeout: 120000 });
  await p.waitForSelector(waitsForPricing ? "#pricing" : "main .card", { timeout: 120000 });
  await p.addStyleTag({
    content: "nextjs-portal{display:none!important}header{display:none!important}",
  });
  if (waitsForPricing) await hydrate(p);
  await p.waitForTimeout(600);
  return { ctx, p };
}

async function shot(name, opts, before) {
  const { ctx, p } = await open(opts);
  if (before) await before(p);
  await p.waitForTimeout(600);
  const el = await p.$(opts.selector ?? "#pricing");
  await el.scrollIntoViewIfNeeded();
  await p.waitForTimeout(400);
  await el.screenshot({ path: `${OUT}\\${name}` });
  console.log("saved", name);
  await ctx.close();
}

const pick = (label) => async (p) => {
  for (const b of await p.$$("#pricing button")) {
    if ((await b.innerText()).trim() === label) {
      await b.click();
      break;
    }
  }
};

const fill = (value) => async (p) => {
  await p.locator("#pricing input[type=number]").fill(value);
};

const D = { width: 1440, height: 1050, lang: "ms-MY" };
const M = { width: 390, height: 844, lang: "ms-MY" };

await shot("01-desktop-default-1usd.png", { ...D, url: `${BASE}/en` });
await shot("02-desktop-5usd.png", { ...D, url: `${BASE}/en` }, pick("$5"));
await shot("03-desktop-custom-25usd.png", { ...D, url: `${BASE}/en` }, fill("25"));
await shot("04-mobile-50usd.png", { ...M, url: `${BASE}/en` }, pick("$50"));
await shot("05-mobile-bm-10usd.png", { ...M, url: `${BASE}/ms`, lang: "ms-MY" }, pick("$10"));
// 06 (ID/Rp) is captured from the local preview instead: staging resolves the
// billing region from Cloudflare's cf-ipcountry, and our egress IP is MY.
await shot("07-mobile-invalid-amount.png", { ...M, url: `${BASE}/en` }, fill("0.5"));
await shot("08-mobile-topup-summary-5usd.png", {
  ...M,
  url: `${BASE}/en/topup?amount=5`,
  selector: "main .card",
  waitsForPricing: false,
});

await browser.close();
console.log("done ->", OUT);
