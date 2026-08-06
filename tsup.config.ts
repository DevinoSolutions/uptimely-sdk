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
 * - `node:crypto` stays external: it is only reached from the `./webhooks`
 *   subpath, which is documented server-only. The main entry has NO node
 *   imports and stays browser-loadable (key use in browsers is still blocked
 *   at runtime unless `dangerouslyAllowBrowser` is set).
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
  noExternal: ["@uptimely/contracts", "@uptimely/shared"],
});
