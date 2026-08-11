## Context

See proposal.md — Why. Headless HybridSearch with injectable Fuse/Transformers and `onnxWasmPaths`. Vitest excludes `tests/e2e/**`. Prefer Node local suite if ORT works; otherwise Playwright — choose reliability on M4.

## Goals / Non-Goals

**Goals:**
- Publish-ready gates with lean CI and full local real search QA
- Keep HybridSearch API stable for ts-school

**Non-Goals:**
- Changing embedding model or index schema
- Automating npm publish

## Decisions

1. **Prefer Node local e2e for MiniLM** if `@huggingface/transformers` + ORT works in Node on this machine; fall back to Playwright. Rationale: faster and simpler than browser for search.
2. **Coverage ≥90% on CI suite** with mocked CDN loaders; real inference only in `test:local`.
3. **First public version stays 0.1.1** (already bumped for CSP paths).

## Risks / Trade-offs

- [Transformers.js Node WASM quirks] → Fall back to Playwright; document chosen path in README/OpenSpec
- [Fixture without vectors] → Generate or ship a small vectors fixture for semantic local tests

## Migration Plan

1. Land gates + docs on `main` with CI green
2. Run `pnpm test:local` on M4
3. Tag `v0.1.1`, GitHub Release
4. Human `npm publish`
5. ts-school → `^0.1.1`

## Open Questions

None.
