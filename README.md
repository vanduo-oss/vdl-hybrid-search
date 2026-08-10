# @vanduo-oss/vdl-hybrid-search

VdlHybridSearch — headless hybrid fuzzy + semantic search (Fuse.js + Transformers.js MiniLM).

**Source of truth:** [`openspec/`](./openspec/). This README is a short usage guide.

## Install

```bash
pnpm add @vanduo-oss/vdl-hybrid-search
# or local dogfood:
# "file:../0_vanduo/vdl-hybrid-search"
```

Private for now (`"private": true`); not published to npm yet.

## Usage

```ts
import { HybridSearch } from '@vanduo-oss/vdl-hybrid-search';
import Fuse from 'fuse.js';

const search = new HybridSearch({
  indexUrl: '/search/search-index.json',
  vectorsUrl: '/search/vectors.json',
  loadFuse: async () => ({ default: Fuse }),
  loadTransformers: async () => import('@huggingface/transformers'),
  // CSP script-src 'self': serve ORT WASM from same origin (copy from
  // @huggingface/transformers/dist) and point here:
  onnxWasmPaths: '/transformers-wasm/',
});

await search.initFuzzy();
const { merged } = await search.search('narrowing', { mode: 'hybrid' });
```

Corpus-agnostic: any index that passes search guardrails validation works. Indexer: `pnpm index` (`scripts/hybrid-search-indexer.mjs`).

## Scripts

- `pnpm build` — vite lib + `.d.ts`
- `pnpm test` — vitest
- `pnpm typecheck` / `pnpm lint`

## License

MIT
