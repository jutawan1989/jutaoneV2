/**
 * Accessibility assertions for the conversion-hook modal: dialog semantics,
 * focus trap, Escape to close, and focus restoration.
 *
 * Runs in one isolated browser context with a unique user agent so it does not
 * consume another visitor's free demo attempts in the shared database.
 */
import { chromium } from "playwright";

const baseUrl = process.env.SHOT_BASE_URL ?? "http://127.0.0.1:3220";
const runId = Date.now();
const userAgent = `JutaOneQA-Modal/${runId} Mozilla/5.0 (X11; Linux x86_64) Chrome/126`;

const problems = [];
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` (${detail})` : ""}`);
  if (!ok) problems.push(name);
}

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  userAgent,
  extraHTTPHeaders: { "cf-ipcountry": "MY" },
});
const page = await context.newPage();

await page.goto(`${baseUrl}/ms`, { waitUntil: "networkidle" });

// Two attempts exhaust the free demo allowance and raise the hook.
for (let attempt = 1; attempt <= 2; attempt += 1) {
  await page.fill("#product", `Biskut mentega bakar sendiri RM25 sebalang ${runId}-${attempt}`);
  await page.click('button[type="submit"]');
  await page.waitForFunction(
    () =>
      document.querySelector("p[aria-live='polite']") !== null ||
      document.querySelector('[role="dialog"]') !== null,
    undefined,
    { timeout: 20000 },
  );
}

const dialog = page.locator('[role="dialog"]');
await dialog.waitFor({ state: "visible", timeout: 25000 });

check("modal uses role=dialog", (await dialog.count()) === 1);
check("modal declares aria-modal", (await dialog.getAttribute("aria-modal")) === "true");
check(
  "modal has an accessible name",
  Boolean(await page.locator("#hook-title").innerText()),
);

// Focus must start inside the dialog.
const startsInside = await page.evaluate(
  () => document.querySelector('[role="dialog"]')?.contains(document.activeElement) ?? false,
);
check("focus moves into the dialog on open", startsInside);

// Tab through more elements than the dialog contains; focus must never escape.
const totalFocusable = await page.evaluate(() => {
  const root = document.querySelector('[role="dialog"]');
  if (!root) return 0;
  return root.querySelectorAll(
    'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
  ).length;
});

let escaped = false;
for (let press = 0; press < totalFocusable * 2; press += 1) {
  await page.keyboard.press("Tab");
  const inside = await page.evaluate(
    () => document.querySelector('[role="dialog"]')?.contains(document.activeElement) ?? false,
  );
  if (!inside) {
    escaped = true;
    break;
  }
}
check("Tab never moves focus behind the modal", !escaped, `${totalFocusable} focusable items`);

let escapedBackwards = false;
for (let press = 0; press < totalFocusable * 2; press += 1) {
  await page.keyboard.press("Shift+Tab");
  const inside = await page.evaluate(
    () => document.querySelector('[role="dialog"]')?.contains(document.activeElement) ?? false,
  );
  if (!inside) {
    escapedBackwards = true;
    break;
  }
}
check("Shift+Tab never moves focus behind the modal", !escapedBackwards);

// Escape closes and returns focus to the trigger.
await page.keyboard.press("Escape");
await dialog.waitFor({ state: "hidden", timeout: 5000 });
check("Escape closes the modal", (await dialog.count()) === 0);

const focusAfter = await page.evaluate(() => ({
  tag: document.activeElement?.tagName?.toLowerCase() ?? null,
  insideBody: document.body.contains(document.activeElement),
}));
check("focus is restored to the page after close", focusAfter.insideBody === true, focusAfter.tag);

await browser.close();

console.log(problems.length === 0 ? "\nall modal a11y checks passed" : `\n${problems.length} failed`);
if (problems.length) process.exitCode = 1;
