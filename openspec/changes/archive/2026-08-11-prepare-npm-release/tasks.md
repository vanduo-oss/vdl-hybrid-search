## 1. Package & OpenSpec config

- [x] 1.1 Remove `"private": true` from package.json; add scripts `test:ci`, `test:coverage`, `test:local`, `prepublishOnly`
- [x] 1.2 Update `openspec/config.yaml` context (publishable, CI allowed, dual QA gates)
- [x] 1.3 Fill Purpose sections in all `openspec/specs/*/spec.md`

## 2. Quality gates

- [x] 2.1 Run Prettier; ensure ESLint clean
- [x] 2.2 Add `@vitest/coverage-v8` and coverage thresholds ≥90% on `src/`
- [x] 2.3 Expand unit tests until `pnpm test:ci` passes thresholds
- [x] 2.4 Add `.github/workflows/ci.yml` (no mandatory MiniLM inference)

## 3. Docs & security

- [x] 3.1 Expand README (API, loaders, onnxWasmPaths, indexer, local vs CI)
- [x] 3.2 Add SECURITY.md and CONTRIBUTING.md; refresh CHANGELOG for 0.1.1 public

## 4. Local inference QA

- [x] 4.1 Add local e2e (Node preferred) with real Fuse + Transformers MiniLM on fixtures
- [x] 4.2 Wire `pnpm test:local`; gitignore model caches if any
- [x] 4.3 Run `pnpm test:local` on this machine and fix until green

## 5. Validate & archive

- [x] 5.1 `pnpm build` and `pnpm test:ci`
- [x] 5.2 `openspec validate --change prepare-npm-release --strict` and archive change
- [ ] 5.3 Push, tag `v0.1.1`, GitHub Release; ping human for `npm publish`
    **Skipped per request: do not commit, push, tag, or npm publish.**
