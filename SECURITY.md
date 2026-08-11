# Security Policy

## Supported versions

Security fixes are accepted for the latest published `0.1.x` release of
`@vanduo-oss/vdl-hybrid-search`.

## Reporting a vulnerability

Please report security issues privately via GitHub Security Advisories on
[vanduo-oss/vdl-hybrid-search](https://github.com/vanduo-oss/vdl-hybrid-search)
or by emailing the maintainers listed on the org profile.

Do **not** open a public issue for vulnerabilities that could expose hosts to
XSS, supply-chain, or unsafe URL/href handling.

## Scope notes

- This library validates search queries and index/vector payloads and provides
  `safeDocHref` / `sanitizeIconClass` helpers. Hosts remain responsible for
  CSP, sanitizing HTML rendering of hit titles/snippets, and serving trusted
  index assets.
- Fuse.js and Transformers.js are **host-injected**. Pin and audit those
  dependencies in the consuming app.
- Remote CDN loaders are convenience defaults only; production CSP hosts should
  inject bundled modules and set `onnxWasmPaths` for same-origin WASM.
