import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const baseUrl = process.env.SHOT_BASE_URL ?? "http://127.0.0.1:3212";
const outDir = process.env.SHOT_DIR ?? "screenshots";
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();

async function shoot(name, path, viewport, headers) {
  const context = await browser.newContext({
    viewport,
    extraHTTPHeaders: headers,
    reducedMotion: "no-preference",
  });
  const page = await context.newPage();
  await page.goto(`${baseUrl}${path}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${outDir}/${name}.png`, fullPage: false });
  await context.close();
  console.log("saved", `${outDir}/${name}.png`);
}

const desktop = { width: 1440, height: 900 };
const mobile = { width: 390, height: 844 };

await shoot("01-home-ms-desktop", "/ms", desktop, { "cf-ipcountry": "MY" });
await shoot("02-home-id-mobile", "/id", mobile, { "cf-ipcountry": "ID" });
await shoot("03-home-en-desktop", "/en", desktop, { "cf-ipcountry": "SG" });

// Second and third demo attempts trigger the paywall hook.
{
  const context = await browser.newContext({
    viewport: desktop,
    extraHTTPHeaders: { "cf-ipcountry": "MY" },
  });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/ms`, { waitUntil: "networkidle" });
  await page.fill("#product", "Biskut mentega bakar sendiri, RM25 sebalang, penghantaran Lembah Klang");
  await page.click('button[type="submit"]');
  await page.waitForSelector("text=Salin", { timeout: 15000 });
  await page.screenshot({ path: `${outDir}/04-caption-output.png` });
  console.log("saved", `${outDir}/04-caption-output.png`);

  await page.click('button[type="submit"]');
  await page.waitForSelector('[role="dialog"]', { timeout: 20000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${outDir}/05-hook-modal.png` });
  console.log("saved", `${outDir}/05-hook-modal.png`);
  await context.close();
}

await browser.close();
