# vdl-hybrid-search Specification

## Purpose

Headless HybridSearch combining Fuse.js fuzzy and Transformers.js MiniLM semantic
retrieval with injectable CDN/host loaders, CSP-safe `onnxWasmPaths`, and
graceful semantic degradation.
## Requirements
### Requirement: HybridSearch headless API

The package MUST export class `HybridSearch` with constructor options `indexUrl`, `vectorsUrl`, thresholds, `loadFuse`, `loadTransformers`, and methods `initFuzzy`, `initSemantic`, `fuzzySearch`, `semanticSearch`, `search`, `mergeResults`, `onSemanticProgress`.

#### Scenario: hybrid mode shape
- **GIVEN** an initialized engine with injectable Fuse
- **WHEN** `search(q, { mode: 'hybrid' })` runs
- **THEN** the result includes `merged` hits with `doc`, `score`, and `source`

### Requirement: graceful semantic failure

When semantic init/search fails, hybrid mode MUST degrade to fuzzy results without throwing from `search`.

#### Scenario: semantic error degrades
- **GIVEN** a failing transformers loader
- **WHEN** hybrid search runs after fuzzy init
- **THEN** fuzzy merged results are still returned

### Requirement: injectable loaders

Hosts MUST be able to inject Fuse and Transformers modules for CSP.

#### Scenario: custom Fuse
- **GIVEN** `loadFuse` returning bundled Fuse
- **WHEN** `initFuzzy` runs
- **THEN** the CDN Fuse loader is not required

### Requirement: CSP-safe ONNX WASM paths

`HybridSearch` MUST accept an optional `onnxWasmPaths` constructor option. When set, after loading Transformers and before calling `pipeline`, the engine MUST assign that value to `env.backends.onnx.wasm.wasmPaths` (trailing slash normalized). When omitted, Transformers.js default CDN behavior MUST remain unchanged.

#### Scenario: host injects same-origin wasmPaths
- **GIVEN** `onnxWasmPaths` is `/transformers-wasm/`
- **WHEN** `initSemantic` loads Transformers
- **THEN** `env.backends.onnx.wasm.wasmPaths` equals `/transformers-wasm/` before `pipeline` runs

#### Scenario: omitted option leaves CDN default
- **GIVEN** no `onnxWasmPaths`
- **WHEN** Transformers loads via CDN or injector
- **THEN** HybridSearch does not overwrite `wasmPaths`

