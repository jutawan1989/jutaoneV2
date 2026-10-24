/**
 * Renders the generated logo SVGs to PNG for visual review.
 */
import { chromium } from "playwright";
import { readFile, mkdir } from "node:fs/promises";

const outDir = new URL("../screenshots/", import.meta.url);
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch();

const sheets = [
  { file: "logo-lockup.svg", out: "logo-lockup-dark.png", width: 640, bg: "#0a1220" },
  { file: "logo-lockup-light.svg", out: "logo-lockup-light.png", width: 640, bg: "#ffffff" },
  { file: "logo-mark.svg", out: "logo-mark-dark.png", width: 720, bg: "#0a1220" },
];

for (const sheet of sheets) {
  const svg = await readFile(new URL(`../public/assets/${sheet.file}`, import.meta.url), "utf8");
  const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

  const page = await browser.newPage({
    viewport: { width: sheet.width + 80, height: sheet.width },
  });
  await page.setContent(
    `<body style="margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:${sheet.bg}">
       <img src="${dataUrl}" style="width:${sheet.width}px;display:block">
     </body>`,
  );
  await page.waitForFunction(() => {
    const img = document.querySelector("img");
    return img && img.complete && img.naturalWidth > 0;
  });
  await page.screenshot({ path: new URL(sheet.out, outDir).pathname, fullPage: true });
  console.log("saved", sheet.out);
  await page.close();
}

await browser.close();
