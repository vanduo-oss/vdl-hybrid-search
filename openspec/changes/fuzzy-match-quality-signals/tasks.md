## 1. API

- [x] 1.1 Add `fuzzyMinScore` / `titleExactBoost` options (default `0`) and `MergedHit` title signals
- [x] 1.2 Apply enrichment in `mergeResults(query?)` and fuzzy-only `search` path
- [x] 1.3 Document in README + CHANGELOG; bump to `0.1.2`

## 2. Tests

- [x] 2.1 Fixture docs for getting-started near-miss
- [x] 2.2 Unit tests for weak/partial/exact, boost, minScore, mergeResults query opt
- [x] 2.3 `pnpm format:check && pnpm lint && pnpm typecheck && pnpm test:ci && pnpm build`

## 3. OpenSpec

- [x] 3.1 `openspec validate --change fuzzy-match-quality-signals --strict`
