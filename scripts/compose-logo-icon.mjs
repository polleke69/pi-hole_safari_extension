/**
 * Wraps repo-root logo.svg in a square canvas with black background for app icons.
 * Logo viewBox is 00 90 130 → centered in 130×130 (20px horizontal inset).
 */
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const logoPath = join(root, "logo.svg");
const outDir = join(root, "assets");
const outPath = join(outDir, "logo-on-black.svg");

const raw = readFileSync(logoPath, "utf8");
const match = raw.match(/<svg\b[^>]*>([\s\S]*)<\/svg>\s*$/im);
if (!match) {
  throw new Error(`Could not parse ${logoPath} as a single <svg> root`);
}
const inner = match[1].trim();
const innerIndented = inner.replace(/^/gm, "    ");

const composed = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 130 130">
  <rect width="130" height="130" fill="#000000"/>
  <svg x="20" y="0" width="90" height="130" viewBox="0 0 90 130" xmlns:xlink="http://www.w3.org/1999/xlink">
${innerIndented}
  </svg>
</svg>
`;

mkdirSync(outDir, { recursive: true });
writeFileSync(outPath, composed);
console.log("Wrote", outPath);
