#!/usr/bin/env node
// Fails when a source file uses a physical-direction Tailwind utility (ml-, pr-, left-, text-right, ...).
// The layout must mirror under <html dir="rtl">, so only logical utilities are allowed:
//   ms-/me-, ps-/pe-, start-/end-, text-start/text-end, rounded-s/e, border-s/e.
// Add `rtl-ok` in a comment on the same line for a deliberate exception.
// Vendored shadcn/ui files (src/components/ui) are skipped: their `data-[side=left]:left-0`-style classes
// implement the components' explicit `side` prop, and re-running `shadcn add` would overwrite any edits.
//
// Usage: node scripts/check-rtl.mjs            -> scans src/
//        node scripts/check-rtl.mjs a.tsx b.ts -> scans the given files (used by `vp staged`)
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const PHYSICAL = new RegExp(
  String.raw`(?<![\w-])-?(?:` +
    [
      String.raw`(?:m|p|scroll-m|scroll-p)[lr]-`, // ml-2, pr-4, -ml-1, scroll-pl-2
      String.raw`(?:left|right)-`, // left-0, right-2
      String.raw`rounded-(?:[lr]|[tb][lr])(?:-|(?=["'\s\x60]))`, // rounded-l, rounded-tr-lg
      String.raw`border-[lr](?:-|(?=["'\s\x60]))`, // border-l, border-r-2
      String.raw`(?:text|float|clear)-(?:left|right)(?![\w-])`, // text-left, float-right
    ].join("|") +
    `)`,
);

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* walk(path);
    else if (/\.(tsx?|css)$/.test(name)) yield path;
  }
}

const VENDORED = /(^|[\\/])src[\\/]components[\\/]ui[\\/]/;
const files = (process.argv.length > 2 ? process.argv.slice(2) : [...walk("src")]).filter(
  (file) => !VENDORED.test(file),
);
const problems = [];

for (const file of files) {
  readFileSync(file, "utf8")
    .split("\n")
    .forEach((line, i) => {
      if (line.includes("rtl-ok")) return;
      const match = line.match(PHYSICAL);
      if (match) problems.push(`${relative(".", file)}:${i + 1}  "${match[0]}"  ${line.trim()}`);
    });
}

if (problems.length) {
  console.error(
    "Physical-direction utilities found (use ms-/me-, ps-/pe-, start-/end-, text-start/end):\n",
  );
  console.error(problems.join("\n"));
  process.exit(1);
}
