# @vanduo-oss/vdl-hybrid-search

**VdlHybridSearch** — headless hybrid fuzzy + semantic search for documentation and curriculum corpora.

Fuzzy retrieval uses [Fuse.js](https://www.fusejs.io/). Semantic retrieval uses [Transformers.js](https://huggingface.co/docs/transformers.js) with **Xenova/all-MiniLM-L6-v2**. The package has **zero runtime npm dependencies**; hosts inject Fuse/Transformers (bundled or CDN) and serve pre-built index/vector JSON.

**Source of truth:** [`openspec/`](./openspec/).

## Install

```bash
pnpm add @vanduo-oss/vdl-hybrid-search
```

Peer/host libraries (install in the app, not pulled by this package):

```bash
pnpm add fuse.js @huggingface/transformers
```

## Quick start

```ts
import { HybridSearch } from '@vanduo-oss/vdl-hybrid-search';
import Fuse from 'fuse.js';

const search = new HybridSearch({
  indexUrl: '/search/search-index.json',
  vectorsUrl: '/search/vectors.json',
  loadFuse: async () => ({ default: Fuse }),
  loadTransformers: async () => import('@huggingface/transformers'),
  // CSP script-src 'self': serve ORT WASM from same origin
  onnxWasmPaths: '/transformers-wasm/',
});

await search.initFuzzy(); // fuzzy-only is enough for many UIs
const { merged } = await search.search('narrowing', { mode: 'hybrid' });
```

## API

### `new HybridSearch(options?)`

| Option | Default | Purpose |
| --- | --- | --- |
| `indexUrl` | `./data/search-index.json` | Search corpus JSON |
| `vectorsUrl` | `./data/vectors.json` | Precomputed embeddings JSON |
| `fuseThreshold` | `0.45` | Fuse match threshold |
| `semanticThreshold` | `0.3` | Cosine similarity floor |
| `maxResults` | `20` | Cap on merged hits |
| `queryMinLength` / `queryMaxLength` | `2` / `240` | Query guardrails |
| `maxDocuments` / `maxVectorDimensions` | `5000` / `4096` | Payload guardrails |
| `semanticBoost` | `1.0` | Multiplier for semantic scores in merge |
| `fuzzyMinScore` | `0` | Drop fuzzy merged hits below this score (post `1 - fuseScore` + boost) |
| `titleExactBoost` | `0` | Add to fuzzy score when normalized query equals doc title |
| `modelName` | `Xenova/all-MiniLM-L6-v2` | Transformers feature-extraction model |
| `loadFuse` | CDN import | Inject Fuse module (`{ default: Fuse }` or constructor) |
| `loadTransformers` | CDN import | Inject `@huggingface/transformers` module |
| `onnxWasmPaths` | unset | Same-origin ORT WASM directory URL |

### Methods

- `initFuzzy()` — fetch + validate index, build Fuse
- `initSemantic()` — requires fuzzy init; load Transformers + vectors
- `fuzzySearch(query)` — sync Fuse hits (empty if not ready / invalid query)
- `semanticSearch(query)` — async MiniLM ranking
- `search(query, { mode })` — `'fuzzy' | 'semantic' | 'hybrid'` (default hybrid). Semantic failures in hybrid mode degrade to fuzzy without throwing. Fuzzy-sourced `merged` hits include optional `titleMatch` / `weakMatch`.
- `mergeResults(fuzzy, semantic, query?)` — score merge + dedupe (requires `initFuzzy`). Pass `query` to attach title quality signals on fuzzy hits.
- `onSemanticProgress(cb)` — download/ready/error events; returns unsubscribe
- `getDocuments()` / `getDocById(id)` / `isSemanticReady()`
- `HybridSearch.resetCDNCache()` — clear module caches (tests)

Also exported: `cosineSimilarity`, `rankBySimilarity`, `VDL_HYBRID_SEARCH_VERSION`, guardrails from `.` and `./guardrails/search`.

### Fuzzy match quality signals

Onboarding queries like “TypeScript getting started” can fuzzy-rank near-miss titles (“Getting types for your dependencies”) highly. With defaults (`fuzzyMinScore: 0`, `titleExactBoost: 0`), ranking matches 0.1.1. Consumers can:

- Read `hit.weakMatch` / `hit.titleMatch` and refuse soft matches in tutors.
- Raise `fuzzyMinScore` or `titleExactBoost` when exact titles should win harder.

`titleMatch` is `exact` when the normalized query equals the title, `partial` when significant tokens or substrings overlap, otherwise `none`. Semantic hits omit these fields.
## Injectable loaders & CSP (`onnxWasmPaths`)

Under strict CSP (`script-src 'self'`), do **not** rely on jsDelivr/unpkg dynamic imports:

1. Bundle `fuse.js` and `@huggingface/transformers` in the host.
2. Pass `loadFuse` / `loadTransformers` injectors (see Quick start).
3. Copy ONNX Runtime WASM assets from `@huggingface/transformers/dist` (or the package’s wasm files) to a same-origin path, e.g. `/transformers-wasm/`.
4. Set `onnxWasmPaths: '/transformers-wasm/'` so Transformers does not fetch WASM from a CDN.

Trailing slash is normalized. When omitted, Transformers.js keeps its default CDN WASM behavior.

## Index schema & indexer

Corpus-agnostic: any `documents[]` that passes search guardrails works (safe routes, bounded fields, arrays, `bodyText`).

Build index + vectors:

```bash
pnpm index
# or
VD3_DOCS_PATH=../vd3-docs pnpm index
```

Writes `data/search-index.json` and `data/vectors.json` via `scripts/hybrid-search-indexer.mjs`. Validate with `validateSearchIndexPayload` / `validateVectorPayload` before shipping.

Helpers: `safeDocHref(baseUrl, route)`, `sanitizeIconClass(icon)`.

## Local QA vs CI

| Gate | Command | What runs |
| --- | --- | --- |
| Unit / CI | `pnpm test` / `pnpm test:ci` | Vitest + coverage ≥90% on `src/**`; mocked fetch/loaders; **no** MiniLM download |
| Local inference | `pnpm test:local` | CI suite **plus** Node e2e with real Fuse + Transformers MiniLM on fixtures |

`tests/e2e/**` is excluded from the default Vitest config. Model cache for local e2e lives under `tests/e2e/.model-cache/` (gitignored).

`prepublishOnly` runs `build` + `test:ci` (not local e2e).

## Scripts

| Script | Description |
| --- | --- |
| `pnpm build` | Vite lib + `.d.ts` |
| `pnpm test` | Unit tests (no e2e) |
| `pnpm test:coverage` / `test:ci` | Unit tests with coverage thresholds |
| `pnpm test:local` | CI suite + real MiniLM e2e |
| `pnpm typecheck` / `lint` / `format` | Quality |
| `pnpm index` | Rebuild search assets |

## License

MIT — see [LICENSE](./LICENSE). Security: [SECURITY.md](./SECURITY.md). Contributing: [CONTRIBUTING.md](./CONTRIBUTING.md).
