#!/usr/bin/env node
// The two pictures this repo ships --- public/card.png and public/favicon.png
// --- are screenshots, so nothing about them notices when the thing they are
// pictures of changes. This is what notices: it hashes everything that decides
// what the shot looks like, records the hash beside the images, and fails once
// the two disagree.
//
//  - The inputs are the built stylesheets and the scripts /card.html and
//    /icon.html load. Those scripts carry render.ts, view.ts, types.ts,
//    compact.ts and settle.ts --- exactly the code that can move a ball or a
//    wall. A change anywhere else never trips this.
//  - A false positive costs one `pnpm images` run, which is the direction to be
//    wrong in.
//  - It reads dist/, so it skips rather than fails when there is no build. CI
//    builds before running check:evidence, so the gate still holds there.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";

const DIST = resolve("dist");
const FINGERPRINT = resolve("scripts/images.fingerprint");

interface Picture {
  /** Where the shipped file lives. */
  file: string;
  /** The page it is a screenshot of. */
  page: string;
  size: [number, number];
}

const PICTURES: Picture[] = [
  { file: "public/card.png", page: "card.html", size: [1200, 630] },
  { file: "public/favicon.png", page: "icon.html", size: [256, 256] },
];

/** [width, height] out of a PNG's IHDR, so a shot taken at the wrong viewport
 *  is caught as well as one taken at the wrong time. */
function pngSize(path: string): [number, number] {
  const header = readFileSync(path).subarray(16, 24);
  return [header.readUInt32BE(0), header.readUInt32BE(4)];
}

function distFiles(dir = DIST, prefix = ""): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? distFiles(join(dir, entry.name), `${prefix}${entry.name}/`)
      : [`${prefix}${entry.name}`],
  );
}

/** What one picture looks like, as a hash: every stylesheet the built site
 *  ships, plus the scripts its own page loads. */
export function fingerprint(page: string): string {
  const doc = new JSDOM(readFileSync(join(DIST, page), "utf8")).window.document;

  const sources = [...doc.querySelectorAll<HTMLScriptElement>("script[src]")]
    .map((el) => el.getAttribute("src") ?? "")
    .map((src) => src.replace(/^.*\/(?=[^/]+$)/, ""));

  const texts = [
    ...[...doc.querySelectorAll("style")].map((el) => el.textContent ?? ""),
    ...distFiles()
      .filter((name) => name.endsWith(".css") || sources.some((src) => name.endsWith(src)))
      .map((name) => readFileSync(join(DIST, name), "utf8")),
  ];

  // Astro's filenames already carry a content hash, so hashing the names would
  // be circular; sorting the content hashes keeps the order stable instead.
  const parts = texts.map((text) => createHash("sha256").update(text).digest("hex")).sort();
  return createHash("sha256").update(parts.join("\n")).digest("hex");
}

function read(): Record<string, string> {
  if (!existsSync(FINGERPRINT)) return {};
  return Object.fromEntries(
    readFileSync(FINGERPRINT, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => line.split(/\s+/) as [string, string]),
  );
}

function main(): void {
  const write = process.argv.includes("--write");
  const problems: string[] = [];
  const fail = (msg: string) => problems.push(msg);

  if (!existsSync(DIST)) {
    console.log("• no dist/, so the pictures cannot be checked for staleness");
    return;
  }

  if (write) {
    const lines = PICTURES.map((p) => `${p.file} ${fingerprint(p.page)}`);
    writeFileSync(FINGERPRINT, `${lines.join("\n")}\n`);
    return;
  }

  const recorded = read();
  for (const picture of PICTURES) {
    if (!existsSync(picture.file)) {
      fail(`no ${picture.file} — it is missing. Run: pnpm images`);
      continue;
    }
    const [width, height] = pngSize(picture.file);
    const [wantWidth, wantHeight] = picture.size;
    if (width !== wantWidth || height !== wantHeight) {
      fail(`${picture.file} is ${width}×${height}, not ${wantWidth}×${wantHeight}. Run: pnpm images`);
    }
    const now = fingerprint(picture.page);
    if (!recorded[picture.file]) {
      fail(`${picture.file} has no recorded fingerprint, so staleness can't be told. Run: pnpm images`);
    } else if (recorded[picture.file] !== now) {
      fail(`${picture.file} is stale — the drawing has changed since it was taken. Run: pnpm images`);
    }
  }

  for (const problem of problems) console.error(`✗ ${problem}`);
  if (problems.length > 0) process.exit(1);
  console.log(`✓ ${PICTURES.length} shipped picture(s) present, sized and current`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
