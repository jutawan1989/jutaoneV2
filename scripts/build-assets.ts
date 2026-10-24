/**
 * Generates the brand asset files in `public/assets/` from `src/lib/brand.ts`.
 * Run with `npm run assets` after changing any logo geometry or colour.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { buildLogoMarkSvg, buildLogoLockupSvg } from "../src/lib/brand.ts";

const outDir = new URL("../public/assets/", import.meta.url);
await mkdir(outDir, { recursive: true });

const files: Array<[string, string]> = [
  ["logo-mark.svg", buildLogoMarkSvg("dark")],
  ["logo-mark-light.svg", buildLogoMarkSvg("light")],
  ["logo-lockup.svg", buildLogoLockupSvg("dark")],
  ["logo-lockup-light.svg", buildLogoLockupSvg("light")],
];

for (const [name, contents] of files) {
  await writeFile(new URL(name, outDir), contents, "utf8");
  console.log(`${name}: ${new Blob([contents]).size} bytes`);
}
