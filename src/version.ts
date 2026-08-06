// Named import so esbuild tree-shakes the rest of package.json out of the
// published bundle (a default import embeds the whole manifest).
import { version } from "../package.json";

/** SDK version — single source is package.json (Changesets bumps it). */
export const VERSION: string = version;
