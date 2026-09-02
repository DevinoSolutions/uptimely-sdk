/**
 * Bundle budgets for the published @uptimely/sdk (CI-baseline item "size-limit
 * (bundle-sensitive libs only)" — CLAUDE.md § CI baseline; added 2026-09-02).
 *
 * This package is the ONE bundle-sensitive artifact in the repo: it is the
 * only thing here that ships to npm and is bundled into somebody else's app.
 * Everything else (the Next apps, the worker, the MCP server) is deployed as
 * a container, where a few KB of JS is not a cost anyone pays.
 *
 * What is measured, and why:
 * - The DIST files, not the sources. `main`/`types` point at src for the
 *   monorepo, but `publishConfig` republishes dist/* — dist is what a
 *   consumer downloads, so `pnpm size` runs after `pnpm build` (the
 *   `pretest`-style ordering lives in the root `sdk:size` script and CI).
 * - `zod` is a real runtime dependency, but it is EXTERNAL here on purpose:
 *   its weight is decided by a version bump, not by SDK code, and folding it
 *   in would mean a zod release silently eating the whole budget while our
 *   own regressions hide underneath it.
 * - The node builtin is listed under BOTH spellings because tsup emits the
 *   bare `crypto` specifier even though the source imports `node:crypto`
 *   (see the note in the README/tsup config); listing one spelling only made
 *   the esbuild step fail to resolve it.
 *
 * Budgets are the measured size plus ~25% headroom (measured 2026-09-02:
 * index 3.26 kB, webhooks 792 B, minified + brotlied). They are a REGRESSION
 * tripwire, not an aspiration — ratchet them DOWN when a change makes the
 * bundle smaller, and raise one only with a deliberate note saying what was
 * added and why it was worth it.
 */
const budgets = [
  {
    name: "index entry (minified + brotlied, zod/node builtins external)",
    path: "dist/index.js",
    ignore: ["zod", "crypto", "node:crypto"],
    limit: "4 kB",
  },
  {
    name: "webhooks entry (minified + brotlied, zod/node builtins external)",
    path: "dist/webhooks.js",
    ignore: ["zod", "crypto", "node:crypto"],
    limit: "1 kB",
  },
];

export default budgets;
