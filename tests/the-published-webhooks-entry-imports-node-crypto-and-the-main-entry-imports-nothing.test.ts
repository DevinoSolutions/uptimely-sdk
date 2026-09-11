/**
 * Pins the PUBLISHED artifact, not the source.
 *
 * `publishConfig` republishes `dist/*` — dist is the only thing a consumer
 * downloads — so the specifier that matters is the one the bundler EMITTED,
 * and it has already diverged from the source once: tsup 8's
 * `removeNodeProtocol` (defaulted `true`, see the note in tsup.config.ts)
 * rewrote the source's `node:crypto` down to a bare `crypto` in both
 * dist/webhooks.js and dist/webhooks.cjs. Node resolves that either way, so no
 * test reading src could see it; a non-Node bundler has no `crypto` builtin to
 * map and fails on the `./webhooks` subpath.
 *
 * The other half is the reason the package can be dual-purpose at all: the
 * MAIN entry must stay browser-loadable, which means it may not carry a node
 * builtin import in either format. (`crypto.randomUUID()` in the request path
 * is the Web Crypto GLOBAL, present in browsers and Node >= 19 — a global read,
 * never an import, which is why this asserts on import/require statements
 * rather than on the word "crypto".)
 *
 * The pins read dist, so they BUILD it first (beforeAll). This file runs under
 * the ROOT `pnpm test` as well as the package's own — the root vitest config
 * includes every `*.test.ts` in the workspace and never builds the SDK — and
 * the first CI run of this pin failed all four cases on a missing dist for
 * exactly that reason (2026-09-11). A `pretest` hook only fires for the
 * package's own script, so the build lives here, where every runner reaches
 * it. It always rebuilds rather than checking for an existing dist: a stale
 * dist would let a broken tsup config pass. If dist is still missing after the
 * build, that is a real failure and reads as one — never a skip.
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

const SDK_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(SDK_ROOT, "dist");

// tsc for the inlined contract types + tsup: tens of seconds cold, so the hook
// carries its own budget instead of inheriting a config default (the package
// config's is 10s).
beforeAll(() => {
  execSync("pnpm build", { cwd: SDK_ROOT, stdio: "pipe" });
}, 180_000);

function readDist(file: string): string {
  const path = join(DIST, file);
  if (!existsSync(path)) {
    throw new Error(
      `${file} is missing from ${DIST} after \`pnpm build\` ran in beforeAll — ` +
        `the build no longer emits this entry, which is a publish defect, not an optional pin.`,
    );
  }
  return readFileSync(path, "utf8");
}

/** ESM `import ... from "x"` / `import "x"` and CJS `require("x")` targets. */
function importedSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const patterns = [
    /\bfrom\s*["']([^"']+)["']/g,
    /\bimport\s*["']([^"']+)["']/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier !== undefined) specifiers.push(specifier);
    }
  }
  return specifiers;
}

describe("the published dist artifact", () => {
  it.each(["webhooks.js", "webhooks.cjs"])(
    "keeps the node: prefix on the crypto import in %s, so a non-Node bundler can resolve the webhooks subpath",
    (file) => {
      const specifiers = importedSpecifiers(readDist(file));
      expect(specifiers).toContain("node:crypto");
      expect(specifiers).not.toContain("crypto");
    },
  );

  it.each(["index.js", "index.cjs"])(
    "leaves %s free of node builtin imports, so the main entry stays loadable in a browser bundle",
    (file) => {
      const nodeBuiltins = importedSpecifiers(readDist(file)).filter(
        (specifier) =>
          specifier.startsWith("node:") ||
          ["crypto", "fs", "path", "http", "https", "url", "buffer"].includes(
            specifier,
          ),
      );
      expect(nodeBuiltins).toEqual([]);
    },
  );
});
