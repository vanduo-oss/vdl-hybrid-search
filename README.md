# @vanduo-oss/vdl-hybrid-search

**VdlHybridSearch** — headless hybrid fuzzy + semantic search for documentation and curriculum corpora.

Fuzzy retrieval uses [Fuse.js](https://www.fusejs.io/). Semantic retrieval uses [Transformers.js](https://huggingface.co/docs/transformers.js) v4 with configurable **embedding presets** (default: **EmbeddingGemma**). The package has **zero runtime npm dependencies**; hosts inject Fuse/Transformers (bundled or CDN) and serve pre-built index/vector JSON.

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
  embeddingPreset: 'embeddinggemma', // default
  loadFuse: async () => ({ default: Fuse }),
  loadTransformers: async () => import('@huggingface/transformers'),
  onnxWasmPaths: '/transformers-wasm/', // CSP script-src 'self'
});

await search.initFuzzy();
const { merged } = await search.search('modal dialog', { mode: 'hybrid' });
```

## Embedding presets

Choose a preset with `embeddingPreset` — it sets `modelName`, `dtype`, dimensions, and prefix strategy in one line. Explicit options override preset defaults.

| Preset | Model | Dims | Prefix strategy | Notes |
| --- | --- | --- | --- | --- |
| `embeddinggemma` (default) | `onnx-community/embeddinggemma-300m-ONNX` | 768 | Query + title/doc prefixes | Best quality; ~300MB download |
| `minilm` | `Xenova/all-MiniLM-L6-v2` | 384 | None | Legacy 0.1.x default; fast |
| `e5` | `Xenova/multilingual-e5-small` | 384 | `query:` / `passage:` | Multilingual |
| `none` | — | — | — | Supply `modelName` + prefixes yourself |

**Rule:** Vectors must be built with the **same model, pooling (`mean`), normalization, and prefixes** as runtime. Mismatch triggers a console warning.

## Building the index

Use the bundled CLI after installing the package:

```bash
npx vdl-hybrid-index --site https://your-site.example --nav ./src/nav.ts --out ./public/search --preset embeddinggemma
```

Or a config file:

```json
{
  "site": "http://127.0.0.1:8787",
  "navPath": "../vd3-docs/src/nav.ts",
  "outDir": "./public/search",
  "preset": "embeddinggemma",
  "fetchConcurrency": 6
}
```

```bash
vdl-hybrid-index --config indexer.config.json
```

Outputs:

- `search-index.json` — `{ documents: SearchDocument[] }`
- `vectors.json` — `{ model, preset, dimensions, generatedAt, documents: [{ id, embedding }] }`

## API

### `new HybridSearch(options?)`

| Option | Default | Purpose |
| --- | --- | --- |
| `embeddingPreset` | `embeddinggemma` | Bundled model + dtype + prefixes |
| `indexUrl` | `./data/search-index.json` | Search corpus JSON |
| `vectorsUrl` | `./data/vectors.json` | Precomputed embeddings JSON |
| `fuseThreshold` | `0.45` | Fuse match threshold |
| `semanticThreshold` | `0.3` | Cosine similarity floor |
| `maxResults` | `20` | Cap on merged hits |
| `maxSemanticResults` | `10` | Cap on semantic hits before merge |
| `modelName` / `dtype` / `queryPrefix` | from preset | Override preset fields |
| `confidence` | enabled | Adaptive display cutoff; `false` to disable |
| `fuzzyMinScore` / `titleExactBoost` | `0` | Fuzzy quality tuning |
| `loadFuse` / `loadTransformers` | CDN import | Inject host libraries |
| `onnxWasmPaths` | unset | Same-origin ORT WASM directory |

### Methods

- `initFuzzy()` / `initSemantic()` — load index, Fuse, Transformers, vectors
- `fuzzySearch(query)` / `semanticSearch(query)` — individual layers
- `search(query, { mode })` — `'fuzzy' | 'semantic' | 'hybrid'` (default hybrid)
- `mergeResults(fuzzy, semantic, query?)` — score merge + dedupe + confidence filter
- `onSemanticProgress(cb)` — download/ready/error events
- `getDocuments()` / `getDocById(id)` / `isSemanticReady()`

Also exported: `EMBEDDING_PRESETS`, `prefixQuery`, `prefixDocument`, `filterConfidentHits`, guardrails from `.` and `./guardrails/search`.

## Tuning

| Knob | When to adjust |
| --- | --- |
| `fuseThreshold` | Lower (e.g. 0.3) for stricter character matching |
| `semanticThreshold` | Lower for EmbeddingGemma (e.g. 0.28) |
| `fuzzyMinScore` | Raise to drop weak fuzzy tail |
| `titleExactBoost` | Raise when exact title matches should win |
| `confidence.minTopScore` | Default 0.53 — raise to reduce noise |
| `confidence: false` | Disable adaptive cutoff entirely |

## CSP / offline

Under `script-src 'self'`, bundle `fuse.js` and `@huggingface/transformers` and set `onnxWasmPaths` to a same-origin WASM directory. CDN defaults use jsDelivr/unpkg.

## QA

```bash
pnpm test:ci      # unit + coverage (mocked loaders)
pnpm test:local   # + real MiniLM e2e (downloads model)
pnpm build
```

## License

MIT
