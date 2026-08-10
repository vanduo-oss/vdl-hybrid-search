## Context

Transformers.js defaults `env.backends.onnx.wasm.wasmPaths` to jsDelivr. Under CSP `script-src 'self'`, dynamic import of `ort-wasm-simd-threaded.jsep.mjs` fails even when the Transformers module itself is bundled.

## Goals / Non-Goals

**Goals:** Optional `onnxWasmPaths` so hosts can point ORT at same-origin assets before `pipeline()`.

**Non-Goals:** Bundling WASM in this package; changing CDN defaults for open CSP hosts.

## Decisions

1. Normalize trailing slash on the path so ORT resolves relative filenames correctly.
2. Apply after `loadTransformers()` returns so injected modules still get configured.
3. No-op when option omitted (preserve CDN default).

## Risks / Trade-offs

Hosts must serve both `.mjs` and `.wasm` from that directory (copy from `@huggingface/transformers/dist`).

## Migration Plan

CSP dogfooders pass `onnxWasmPaths` (ts-school will).

## Open Questions

- None.
