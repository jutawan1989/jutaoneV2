import { chromium } from "playwright";

const baseUrl = process.env.SHOT_BASE_URL ?? "http://127.0.0.1:3212";
const browser = await chromium.launch();
const problems = [];
const checks = [];

function check(name, condition, detail = "") {
  checks.push({ name, ok: Boolean(condition), detail });
  if (!condition) problems.push(`${name} ${detail}`);
}

for (const [locale, country, height] of [
  ["ms", "MY", 900],
  ["id", "ID", 900],
  ["en", "SG", 900],
]) {
  const context = await browser.newContext({
    viewport: { width: 1440, height },
    extraHTTPHeaders: { "cf-ipcountry": country },
  });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/${locale}`, { waitUntil: "networkidle" });

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  check(`${locale}: no horizontal overflow (desktop)`, overflow <= 1, `overflow=${overflow}`);

  const globe = page.locator("svg[role='img']");
  check(`${locale}: hero globe rendered`, (await globe.count()) > 0);
  if ((await globe.count()) > 0) {
    const box = await globe.first().boundingBox();
    check(`${locale}: hero globe has size`, box && box.width > 100 && box.height > 100, JSON.stringify(box));
  }

  const h1 = (await page.locator("h1").first().innerText()).replace(/\s+/g, " ").trim();
  check(`${locale}: h1 present`, h1.length > 10, h1);

  const textarea = page.locator("#product");
  check(`${locale}: demo input visible`, await textarea.isVisible());
  check(`${locale}: demo input maxLength 200`, (await textarea.getAttribute("maxlength")) === "200");

  const disclaimers = await page.getByText(/Simulasi — bukan nasihat|Simulation — not investment advice/).count();
  check(`${locale}: simulation disclaimer on page`, disclaimers >= 1, `count=${disclaimers}`);

  check(`${locale}: lang attribute`, (await page.getAttribute("html", "lang")) !== null);

  const unlabelledButtons = await page.evaluate(() =>
    [...document.querySelectorAll("button")].filter((button) => {
      const name = (button.textContent ?? "").trim() || button.getAttribute("aria-label");
      return !name;
    }).length,
  );
  check(`${locale}: every button has an accessible name`, unlabelledButtons === 0, `${unlabelledButtons} unnamed`);

  await context.close();
}

{
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    extraHTTPHeaders: { "cf-ipcountry": "ID" },
  });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/id`, { waitUntil: "networkidle" });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  check("id mobile: no horizontal overflow", overflow <= 1, `overflow=${overflow}`);

  const sticky = await page.locator("header").first().evaluate((node) => getComputedStyle(node).position);
  check("id mobile: navbar sticky", sticky === "sticky", sticky);

  const widgets = await page.locator(".widget-float").boundingBox();
  check("id mobile: gold widget visible", widgets && widgets.width > 200, JSON.stringify(widgets));
  await context.close();
}

{
  // prefers-reduced-motion must stop the marquee and globe animations.
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: "reduce",
    extraHTTPHeaders: { "cf-ipcountry": "MY" },
  });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/ms`, { waitUntil: "networkidle" });
  const animations = await page.evaluate(() => {
    const track = document.querySelector(".marquee__track");
    const meridians = document.querySelector(".jo-globe__spin");
    return {
      marquee: track ? getComputedStyle(track).animationName : "missing",
      globe: meridians ? getComputedStyle(meridians).animationName : "missing",
    };
  });
  check("reduced motion: marquee animation off", animations.marquee === "none", animations.marquee);
  check("reduced motion: globe animation off", animations.globe === "none", animations.globe);
  await context.close();
}

await browser.close();

for (const entry of checks) {
  console.log(`${entry.ok ? "PASS" : "FAIL"}  ${entry.name}${entry.detail ? ` (${entry.detail})` : ""}`);
}
console.log(`\n${checks.filter((c) => c.ok).length}/${checks.length} checks passed`);
if (problems.length) process.exitCode = 1;
