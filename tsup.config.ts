import { defineConfig } from "tsup";

/**
 * Publish build for @uptimely/sdk (open-api Phase 4, GetItDone template).
 *
 * - `@uptimely/contracts` (and its `@uptimely/shared` type dep) are BUNDLED
 *   (`noExternal`) — both packages are private to the monorepo, so the
 *   published SDK must carry the types/values it uses. The main entry imports
 *   contracts types `import type`-only, so no contracts runtime code lands in
 *   `index.*`; the `webhooks` entry deliberately bundles the Standard
 *   Webhooks verifier from the server-only signing subpath.
 * - `node:crypto` stays external AND keeps its `node:` prefix: it is only
 *   reached from the `./webhooks` subpath, which is documented server-only.
 *   The main entry has NO node imports and stays browser-loadable (key use in
 *   browsers is still blocked at runtime unless `dangerouslyAllowBrowser` is
 *   set). `removeNodeProtocol: false` is load-bearing — see the note on that
 *   option below.
 * - zod is a regular dependency (declaration files reference contract schema
 *   types); it is external here and never bundled.
 * - The declaration bundle must INLINE the private workspace packages' types
 *   (they don't exist on npm), but rollup-plugin-dts cannot digest their raw
 *   .ts source. So `pnpm build` first emits real .d.ts for contracts + shared
 *   into .contract-types/ (tsconfig.contract-types.json), and the dts build
 *   resolves the package ids there via `paths`.
 */
export default defineConfig({
  entry: { index: "src/index.ts", webhooks: "src/webhooks.ts" },
  format: ["esm", "cjs"],
  dts: {
    resolve: true,
    compilerOptions: {
      baseUrl: ".",
      paths: {
        "@uptimely/contracts": ["./.contract-types/contracts/src/index.d.ts"],
        "@uptimely/contracts/webhooks/signing": [
          "./.contract-types/contracts/src/webhooks/signing.d.ts",
        ],
        "@uptimely/shared/ai-scopes": [
          "./.contract-types/shared/src/ai-scopes.d.ts",
        ],
        "@uptimely/shared/outbox-events": [
          "./.contract-types/shared/src/outbox-events.d.ts",
        ],
      },
    },
  },
  sourcemap: true,
  clean: true,
  target: "node20",
  platform: "neutral",
  external: ["node:crypto", "zod"],
  /**
   * Keep the `node:` prefix the source actually wrote.
   *
   * tsup 8 registers its own `node-protocol-plugin`
   * (tsup/dist/index.js — `nodeProtocolPlugin`, wired at `options
   * .removeNodeProtocol && nodeProtocolPlugin()`) whose `onResolve`
   * rewrites every `node:*` specifier to `path.slice("node:".length)`
   * and marks it external, and `normalizeOptions` defaults the flag to
   * `true`. That is what emitted `import { createHmac } from "crypto"`
   * into dist/webhooks.js and `require("crypto")` into dist/webhooks.cjs
   * while the source said `node:crypto` — fine under Node, unresolvable
   * for a non-Node bundler that has no `crypto` builtin to map, and a
   * contradiction of the external list two lines up. esbuild is NOT the
   * cause: 0.27.7 preserves `node:crypto` on platform neutral/node/browser
   * at every target we build for.
   *
   * tsup's own types say this default "will be flipped to `false` in the
   * next major release", so setting it explicitly is also what makes that
   * flip a no-op here rather than a silent artifact change.
   */
  removeNodeProtocol: false,
  noExternal: ["@uptimely/contracts", "@uptimely/shared"],
});
