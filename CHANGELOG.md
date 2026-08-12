# Changelog

## 0.1.2 — fuzzy match quality signals

- Optional `fuzzyMinScore` and `titleExactBoost` (defaults `0`) so ranking/inclusion stay identical unless opted in.
- Fuzzy `MergedHit`s may include `titleMatch` (`exact` | `partial` | `none`) and `weakMatch` so tutors can refuse soft near-misses (e.g. “getting started” vs “Getting types for your dependencies”).
- `mergeResults(fuzzy, semantic, query?)` accepts an optional query for title signals; `search()` always passes the normalized query.

## 0.1.1 — public release candidate

First public npm release of `@vanduo-oss/vdl-hybrid-search`.

- Optional `onnxWasmPaths` for CSP hosts (same-origin ORT WASM).
- Publishable package metadata (`private` removed); `prepublishOnly` runs build + `test:ci`.
- Dual QA gates: `test:ci` (coverage ≥90%, mocked loaders) and `test:local` (real Fuse + MiniLM).
- GitHub Actions CI: format, lint, typecheck, `test:ci`, build, pack dry-run, audit (no inference).
- Expanded README; added SECURITY.md and CONTRIBUTING.md.

## 0.1.0

- Initial promotion from vanduo-oss/labs (`neptune-search.js` → `HybridSearch`) as a standalone TypeScript package.
