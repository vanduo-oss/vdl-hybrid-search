# Changelog

## 0.1.1 — public release candidate

First public npm release of `@vanduo-oss/vdl-hybrid-search`.

- Optional `onnxWasmPaths` for CSP hosts (same-origin ORT WASM).
- Publishable package metadata (`private` removed); `prepublishOnly` runs build + `test:ci`.
- Dual QA gates: `test:ci` (coverage ≥90%, mocked loaders) and `test:local` (real Fuse + MiniLM).
- GitHub Actions CI: format, lint, typecheck, `test:ci`, build, pack dry-run, audit (no inference).
- Expanded README; added SECURITY.md and CONTRIBUTING.md.

## 0.1.0

- Initial promotion from vanduo-oss/labs (`neptune-search.js` → `HybridSearch`) as a standalone TypeScript package.
