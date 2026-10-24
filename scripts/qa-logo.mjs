/**
 * Structural QA for the generated logo SVGs. Catches the failure modes that
 * matter for a hand-built vector mark: ink clipped by the viewBox, a letter
 * that did not render, or a globe that is not the widest element.
 */
import { chromium } from "playwright";
import { readFile } from "node:fs/promises";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 700 } });

const problems = [];
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` (${detail})` : ""}`);
  if (!ok) problems.push(name);
}

async function analyse(file, scale) {
  const svg = await readFile(new URL(`../public/assets/${file}`, import.meta.url), "utf8");
  const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

  await page.setContent(
    `<body style="margin:0;background:transparent"><img id="l" src="${dataUrl}" style="display:block;width:${scale}px"></body>`,
  );
  await page.waitForFunction(() => {
    const img = document.getElementById("l");
    return img && img.complete && img.naturalWidth > 0;
  });

  return page.evaluate(async () => {
    const img = document.getElementById("l");
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);

    const alphaAt = (x, y) => data[(y * width + x) * 4 + 3];
    const columns = new Array(width).fill(0);
    let minX = width;
    let maxX = -1;
    let minY = height;
    let maxY = -1;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (alphaAt(x, y) > 40) {
          columns[x] += 1;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }

    const rows = new Array(height).fill(0);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (alphaAt(x, y) > 40) rows[y] += 1;
      }
    }

    // Group indices into runs of ink separated by a small gap.
    function toRuns(counts, gap) {
      const runs = [];
      let runStart = -1;
      let lastInk = -1;
      for (let i = 0; i < counts.length; i += 1) {
        if (counts[i] > 0) {
          if (runStart === -1) runStart = i;
          else if (i - lastInk > gap) {
            runs.push([runStart, lastInk]);
            runStart = i;
          }
          lastInk = i;
        }
      }
      if (runStart !== -1) runs.push([runStart, lastInk]);
      return runs.map(([a, b]) => ({ start: a, end: b, width: b - a + 1 }));
    }

    return {
      width,
      height,
      minX,
      maxX,
      minY,
      maxY,
      runs: toRuns(columns, Math.max(2, Math.round(width * 0.01))),
      rowRuns: toRuns(rows, Math.max(2, Math.round(height * 0.01))),
    };
  });
}

const mark = await analyse("logo-mark.svg", 1200);

check("mark: renders", mark.maxX > 0, `${mark.width}x${mark.height}`);
check(
  "mark: ink inside the viewBox with a margin",
  mark.minX > 3 && mark.minY > 3 && mark.maxX < mark.width - 4 && mark.maxY < mark.height - 4,
  `x ${mark.minX}-${mark.maxX}/${mark.width}, y ${mark.minY}-${mark.maxY}/${mark.height}`,
);
check(
  "mark: reads as three separate glyph groups (J, globe, B)",
  mark.runs.length === 3,
  `runs=${JSON.stringify(mark.runs.map((r) => r.width))}`,
);
if (mark.runs.length === 3) {
  const [j, globe, b] = mark.runs;
  check("mark: the globe is the widest group", globe.width > j.width && globe.width > b.width, `${j.width} / ${globe.width} / ${b.width}`);
  check("mark: groups are left-to-right J, globe, B", j.start < globe.start && globe.start < b.start);
  check("mark: letters are comparably sized", Math.abs(j.width - b.width) / Math.max(j.width, b.width) < 0.45, `${j.width} vs ${b.width}`);
}

const lockup = await analyse("logo-lockup.svg", 900);
check(
  "lockup: ink inside the viewBox",
  lockup.minX > 3 && lockup.maxX < lockup.width - 4 && lockup.maxY < lockup.height - 4,
  `y ${lockup.minY}-${lockup.maxY}/${lockup.height}`,
);
check(
  "lockup: mark, wordmark and tagline form separate bands",
  lockup.rowRuns.length >= 3,
  `bands=${JSON.stringify(lockup.rowRuns.map((r) => r.width))}`,
);

for (const file of ["logo-mark.svg", "logo-mark-light.svg", "logo-lockup.svg", "logo-lockup-light.svg"]) {
  const svg = await readFile(new URL(`../public/assets/${file}`, import.meta.url), "utf8");
  check(`${file}: under the 300KB motion budget`, Buffer.byteLength(svg) < 20_000, `${Buffer.byteLength(svg)} bytes`);
  check(`${file}: has a viewBox and an accessible label`, svg.includes("viewBox=") && svg.includes("aria-label"));
}

await browser.close();
console.log(problems.length === 0 ? "\nall logo checks passed" : `\n${problems.length} failed`);
if (problems.length) process.exitCode = 1;
