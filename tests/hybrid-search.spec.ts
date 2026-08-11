import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import Fuse from 'fuse.js';
import {
  HybridSearch,
  cosineSimilarity,
  rankBySimilarity,
  VDL_HYBRID_SEARCH_VERSION,
  DEFAULT_DOCS_BASE_URL,
  type SearchDocument,
} from '../src/index.js';
import {
  normalizeSearchQuery,
  validateSearchQuery,
  validateSearchIndexDocument,
  validateSearchIndexPayload,
  validateVectorPayload,
  safeDocHref,
  sanitizeIconClass,
  searchGuardrails,
  VD_GUARDRAILS_VERSION,
} from '../src/guardrails/search.js';
import { allow, block, normalizeText, toGuardrailError } from '../src/guardrails/core.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const fixture = JSON.parse(
  readFileSync(join(root, 'tests/fixtures/curriculum-search-index.json'), 'utf8'),
);

const mockDocs = fixture.documents as SearchDocument[];

function makeVectors(docs = mockDocs, dims = 4) {
  return {
    documents: docs.map((d, i) => ({
      id: d.id,
      embedding: Array.from({ length: dims }, (_, j) => (j === i % dims ? 1 : 0)),
    })),
  };
}

function stubFetch(indexPayload: unknown = fixture, vectorsPayload: unknown = makeVectors()) {
  return vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (String(url).includes('vectors')) {
        return { ok: true, json: async () => vectorsPayload };
      }
      return { ok: true, json: async () => indexPayload };
    }),
  );
}

function createSearch(overrides: ConstructorParameters<typeof HybridSearch>[0] = {}) {
  return new HybridSearch({
    indexUrl: 'https://example.test/index.json',
    vectorsUrl: 'https://example.test/vectors.json',
    loadFuse: async () => ({ default: Fuse }),
    loadTransformers: async () => {
      throw new Error('semantic unavailable');
    },
    ...overrides,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  HybridSearch.resetCDNCache();
});

describe('smoke', () => {
  it('version matches package.json', () => {
    expect(VDL_HYBRID_SEARCH_VERSION).toBe(pkg.version);
    expect(HybridSearch.VERSION).toBe(pkg.version);
    expect(DEFAULT_DOCS_BASE_URL).toContain('vd3-docs');
    expect(VD_GUARDRAILS_VERSION).toBeTruthy();
  });
});

describe('math helpers', () => {
  it('cosineSimilarity of identical vectors is 1', () => {
    const vec = [0.5, 0.5, 0.5, 0.5];
    expect(cosineSimilarity(vec, vec)).toBeCloseTo(1, 5);
  });

  it('cosineSimilarity handles orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
  });

  it('rankBySimilarity filters and sorts', () => {
    const ranked = rankBySimilarity(
      [1, 0, 0],
      [
        { id: 'a', embedding: [0.9, 0.1, 0] },
        { id: 'b', embedding: [0.1, 0.9, 0] },
        { id: 'c', embedding: [0.5, 0.5, 0] },
      ],
      0.3,
    );
    expect(ranked.length).toBe(2);
    expect(ranked[0].id).toBe('a');
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
  });

  it('rankBySimilarity drops non-finite scores', () => {
    const ranked = rankBySimilarity(
      [1, 0],
      [
        { id: 'ok', embedding: [1, 0] },
        { id: 'bad', embedding: [Number.NaN, 0] },
      ],
      0.1,
    );
    expect(ranked.map((r) => r.id)).toEqual(['ok']);
  });
});

describe('guardrails core', () => {
  it('normalizeText collapses whitespace and handles nullish', () => {
    expect(normalizeText(null)).toBe('');
    expect(normalizeText(undefined)).toBe('');
    expect(normalizeText('  a   b  ')).toBe('a b');
  });

  it('allow/block/toGuardrailError shape results', () => {
    expect(allow()).toEqual({ allowed: true });
    expect(allow({ n: 1 }).meta).toEqual({ n: 1 });
    const blocked = block({
      code: 'x',
      message: 'nope',
      matchedPatternIds: ['p1'],
      meta: { a: 1 },
    });
    expect(blocked.allowed).toBe(false);
    const err = toGuardrailError(blocked);
    expect(err.name).toBe('GuardrailError');
    expect(err.code).toBe('x');
    expect(err.guardrail).toBe(blocked);
    expect(toGuardrailError({ allowed: false }).code).toBe('guardrail.blocked');
  });
});

describe('search guardrails', () => {
  it('normalizeSearchQuery trims and truncates', () => {
    expect(normalizeSearchQuery('  hello  world  ')).toBe('hello world');
    expect(normalizeSearchQuery('abcdef', { maxLength: 3 })).toBe('abc');
  });

  it('rejects empty, short, long, and pathological queries', () => {
    expect(validateSearchQuery('').allowed).toBe(false);
    expect(validateSearchQuery('a').allowed).toBe(false);
    expect(validateSearchQuery('ab').allowed).toBe(true);
    expect(validateSearchQuery('x'.repeat(241)).allowed).toBe(false);
    expect(validateSearchQuery('a'.repeat(20)).code).toBe('search.query.pathological');
    expect(searchGuardrails.validateSearchQuery('ok').allowed).toBe(true);
  });

  it('validates index documents thoroughly', () => {
    expect(validateSearchIndexDocument(null).allowed).toBe(false);
    expect(validateSearchIndexDocument({}).code).toBe('search.doc.id');
    expect(
      validateSearchIndexDocument({
        id: 'ok',
        title: 'T',
        category: 'C',
        route: '/ok',
        keywords: [],
        headings: [],
        classes: [],
        chunks: [],
        bodyText: 'body',
      }).allowed,
    ).toBe(true);

    expect(
      validateSearchIndexDocument({
        id: 'ok',
        title: 'T',
        category: 'C',
        route: 'components/button',
        keywords: [],
        headings: [],
        classes: [],
        chunks: [],
        bodyText: 'body',
      }).allowed,
    ).toBe(true);

    expect(
      validateSearchIndexDocument({
        id: 'ok',
        title: 'T',
        category: 'C',
        route: 'https://evil.example',
        keywords: [],
        headings: [],
        classes: [],
        chunks: [],
        bodyText: 'body',
      }).allowed,
    ).toBe(false);

    expect(
      validateSearchIndexDocument({
        id: 'ok',
        title: 'T',
        category: 'C',
        route: '/ok',
        icon: 'bad icon!',
        keywords: [],
        headings: [],
        classes: [],
        chunks: [],
        bodyText: 'body',
      }).code,
    ).toBe('search.doc.icon');

    expect(
      validateSearchIndexDocument({
        id: 'ok',
        title: 'T',
        category: 'C',
        route: '/ok',
        keywords: 'nope',
        headings: [],
        classes: [],
        chunks: [],
        bodyText: 'body',
      }).code,
    ).toBe('search.doc.arrays');

    expect(
      validateSearchIndexDocument({
        id: 'ok',
        title: 'T',
        category: 'C',
        route: '/ok',
        keywords: [],
        headings: [],
        classes: [],
        chunks: [],
        bodyText: 'x'.repeat(12001),
      }).code,
    ).toBe('search.doc.body');
  });

  it('validates index payloads for shape, empty, duplicates, and max', () => {
    expect(validateSearchIndexPayload(null).allowed).toBe(false);
    expect(validateSearchIndexPayload({ documents: [] }).code).toBe('search.index.empty');
    expect(validateSearchIndexPayload(fixture).allowed).toBe(true);
    expect(validateSearchIndexPayload(fixture, { maxDocuments: 1 }).code).toBe(
      'search.index.too_many_docs',
    );
    expect(
      validateSearchIndexPayload({
        documents: [mockDocs[0], { ...mockDocs[0] }],
      }).code,
    ).toBe('search.index.duplicate_id');
  });

  it('validates vector payloads thoroughly', () => {
    expect(validateVectorPayload(null).allowed).toBe(false);
    expect(validateVectorPayload({ documents: [] }).code).toBe('search.vectors.empty');
    expect(validateVectorPayload(makeVectors()).allowed).toBe(true);
    expect(validateVectorPayload(makeVectors(), { maxDocuments: 1 }).code).toBe(
      'search.vectors.too_many_docs',
    );
    expect(
      validateVectorPayload({
        documents: [{ id: 'a', embedding: [1] }],
      }).code,
    ).toBe('search.vectors.dimension');
    expect(
      validateVectorPayload({
        documents: [
          { id: 'a', embedding: [1, 0] },
          { id: 'b', embedding: [1, 0, 0] },
        ],
      }).code,
    ).toBe('search.vectors.dimension_mismatch');
    expect(
      validateVectorPayload({
        documents: [{ id: 'a', embedding: [1, Number.NaN] }],
      }).code,
    ).toBe('search.vectors.non_finite');
    expect(
      validateVectorPayload({
        documents: [{ id: 1, embedding: [1, 0] }],
      }).code,
    ).toBe('search.vectors.row_shape');
  });

  it('safeDocHref and sanitizeIconClass harden outputs', () => {
    expect(safeDocHref('https://docs.example/base/', '/components/button')).toBe(
      'https://docs.example/base/components/button',
    );
    expect(safeDocHref('https://docs.example/base', '/')).toBe('https://docs.example/base/');
    expect(safeDocHref('https://docs.example', 'legacy/route')).toBe(
      'https://docs.example/#legacy/route',
    );
    expect(safeDocHref('ftp://bad', '/ok')).toContain('vd3-docs');
    expect(safeDocHref('not a url', '/ok')).toContain('vd3-docs');
    expect(safeDocHref('https://docs.example', '')).toBe('#');
    expect(safeDocHref('https://docs.example', '../escape')).toBe('#');
    expect(safeDocHref('https://docs.example', 'bad:route')).toBe('#');
    expect(safeDocHref('https://docs.example', '/bad?x=1')).toBe('#');
    expect(sanitizeIconClass('ph-git-branch')).toBe('git-branch');
    expect(sanitizeIconClass('!!!')).toBe('file-text');
    expect(sanitizeIconClass(null)).toBe('file-text');
  });
});

describe('HybridSearch', () => {
  it('applies constructor defaults and custom options', () => {
    const defaults = new HybridSearch();
    expect(defaults.indexUrl).toBe('./data/search-index.json');
    expect(defaults.vectorsUrl).toBe('./data/vectors.json');
    expect(defaults.fuseThreshold).toBe(0.45);
    expect(defaults.modelName).toBe('Xenova/all-MiniLM-L6-v2');

    const custom = createSearch({
      fuseThreshold: 0.2,
      semanticThreshold: 0.1,
      maxResults: 5,
      queryMinLength: 3,
      queryMaxLength: 100,
      maxDocuments: 10,
      maxVectorDimensions: 8,
      semanticBoost: 2,
      modelName: 'custom/model',
    });
    expect(custom.fuseThreshold).toBe(0.2);
    expect(custom.semanticBoost).toBe(2);
    expect(custom.modelName).toBe('custom/model');
  });

  it('initFuzzy loads index, rejects bad payloads, and exposes docs', async () => {
    stubFetch();
    const search = createSearch();
    await search.initFuzzy();
    expect(search.getDocuments()).toHaveLength(mockDocs.length);
    expect(search.getDocById(mockDocs[0].id)?.title).toBe(mockDocs[0].title);
    expect(search.getDocById('missing')).toBeNull();
    expect(search.isSemanticReady()).toBe(false);

    vi.unstubAllGlobals();
    stubFetch({ documents: [] });
    const bad = createSearch();
    await expect(bad.initFuzzy()).rejects.toThrow(/empty|validation/i);
  });

  it('initFuzzy throws on non-ok fetch', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })),
    );
    const search = createSearch();
    await expect(search.initFuzzy()).rejects.toThrow(/Failed to load search index: 500/);
  });

  it('fuzzySearch returns [] before init and for invalid queries', async () => {
    const search = createSearch();
    expect(search.fuzzySearch('narrowing')).toEqual([]);
    stubFetch();
    await search.initFuzzy();
    expect(search.fuzzySearch('a')).toEqual([]);
    expect(search.fuzzySearch('narrowing').length).toBeGreaterThan(0);
  });

  it('mergeResults requires init, warns on missing semantic docs, and dedupes', async () => {
    const search = createSearch({ maxResults: 2, semanticBoost: 2 });
    expect(() => search.mergeResults([], [])).toThrow(/initFuzzy/);

    (search as unknown as { _docs: unknown; _docMap: Map<string, unknown> })._docs = mockDocs;
    (search as unknown as { _docMap: Map<string, unknown> })._docMap = new Map(
      mockDocs.map((d) => [d.id, d]),
    );

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const merged = search.mergeResults(
      [
        { item: mockDocs[0], score: 0.1 },
        { item: mockDocs[1], score: 0.2 },
      ],
      [
        { id: mockDocs[0].id, score: 0.9 },
        { id: 'ghost', score: 0.95 },
      ],
    );
    expect(merged.length).toBe(2);
    expect(merged[0].source).toBe('semantic');
    expect(merged[0].score).toBeCloseTo(1.8);
    expect(warn).toHaveBeenCalled();
  });

  it('onSemanticProgress subscribes and unsubscribes', async () => {
    const events: string[] = [];
    const wasmEnv = { wasmPaths: 'https://cdn.example/default/' };
    stubFetch();
    const search = createSearch({
      onnxWasmPaths: '/transformers-wasm',
      loadTransformers: async () => ({
        env: { backends: { onnx: { wasm: wasmEnv } } },
        pipeline: async (
          _task: string,
          _model: string,
          opts?: {
            progress_callback?: (progress: {
              status?: string;
              loaded?: number;
              total?: number;
            }) => void;
          },
        ) => {
          opts?.progress_callback?.({ status: 'progress', loaded: 50, total: 100 });
          return async () => ({ data: [1, 0, 0, 0] });
        },
      }),
    });
    const off = search.onSemanticProgress((d) => {
      if (d.stage) events.push(d.stage);
    });
    await search.initSemantic();
    expect(events).toContain('loading-model');
    expect(events).toContain('downloading');
    expect(events).toContain('ready');
    expect(wasmEnv.wasmPaths).toBe('/transformers-wasm/');
    off();
    search.onSemanticProgress(() => {});
  });

  it('skips onnxWasmPaths when unset or when wasm env missing', async () => {
    stubFetch();
    const search = createSearch({
      loadTransformers: async () => ({
        env: {},
        pipeline: async () => async () => ({ data: [1, 0, 0, 0] }),
      }),
    });
    await search.initSemantic();
    expect(search.isSemanticReady()).toBe(true);
  });

  it('initSemantic validates vectors and unknown ids', async () => {
    stubFetch(fixture, {
      documents: [{ id: 'ghost', embedding: [1, 0, 0, 0] }],
    });
    const search = createSearch({
      loadTransformers: async () => ({
        pipeline: async () => async () => ({ data: [1, 0, 0, 0] }),
      }),
    });
    await expect(search.initSemantic()).rejects.toThrow(/unknown doc id/);
    expect(search.isSemanticReady()).toBe(false);
    await expect(search.initSemantic()).rejects.toThrow(/previously failed/);
  });

  it('initSemantic fails on vector fetch/validation errors and emits error progress', async () => {
    const events: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).includes('vectors')) {
          return { ok: false, status: 404, json: async () => ({}) };
        }
        return { ok: true, json: async () => fixture };
      }),
    );
    const search = createSearch({
      loadTransformers: async () => ({
        pipeline: async () => async () => ({ data: [1, 0, 0, 0] }),
      }),
    });
    search.onSemanticProgress((d) => {
      if (d.stage) events.push(d.stage);
    });
    await expect(search.initSemantic()).rejects.toThrow(/Failed to load vectors: 404/);
    expect(events).toContain('error');
  });

  it('initSemantic rejects invalid vector payload', async () => {
    stubFetch(fixture, { documents: [] });
    const search = createSearch({
      loadTransformers: async () => ({
        pipeline: async () => async () => ({ data: [1, 0, 0, 0] }),
      }),
    });
    await expect(search.initSemantic()).rejects.toThrow(/empty|validation/i);
  });

  it('semanticSearch returns ranked hits and rejects invalid queries', async () => {
    stubFetch();
    const search = createSearch({
      semanticThreshold: 0.1,
      loadTransformers: async () => ({
        pipeline: async () => async () => ({ data: [1, 0, 0, 0] }),
      }),
    });
    await search.initSemantic();
    expect(await search.semanticSearch('a')).toEqual([]);
    const hits = await search.semanticSearch('truthiness');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].id).toBe(mockDocs[0].id);
  });

  it('search fuzzy/hybrid/semantic modes and invalid mode', async () => {
    stubFetch();
    const search = createSearch({
      semanticThreshold: 0.1,
      loadTransformers: async () => ({
        pipeline: async () => async () => ({ data: [1, 0, 0, 0] }),
      }),
    });

    const empty = await search.search('a', { mode: 'fuzzy' });
    expect(empty.merged).toEqual([]);

    const fuzzy = await search.search(mockDocs[0].title.slice(0, 12), { mode: 'fuzzy' });
    expect(fuzzy.mode).toBe('fuzzy');
    expect(fuzzy.merged[0].source).toBe('fuzzy');

    const hybrid = await search.search('truthiness', { mode: 'hybrid' });
    expect(hybrid.merged.length).toBeGreaterThan(0);
    expect(hybrid.semantic.length).toBeGreaterThan(0);

    const semantic = await search.search('truthiness', { mode: 'semantic' });
    expect(semantic.merged.every((m) => m.source === 'semantic')).toBe(true);

    await expect(search.search('ok', { mode: 'nope' as 'fuzzy' })).rejects.toThrow(
      /Invalid search mode/,
    );
  });

  it('hybrid search degrades gracefully when semantic fails', async () => {
    stubFetch();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const search = createSearch({
      loadTransformers: async () => {
        throw new Error('boom semantic');
      },
    });
    const result = await search.search(mockDocs[0].title.slice(0, 12), { mode: 'hybrid' });
    expect(result.fuzzy.length).toBeGreaterThan(0);
    expect(result.semantic).toEqual([]);
    expect(result.merged.length).toBeGreaterThan(0);
    expect(result.merged[0].source).toBe('fuzzy');
    expect(warn).toHaveBeenCalled();
  });

  it('semantic-only mode skips missing docs in merged mapping', async () => {
    stubFetch();
    const search = createSearch({
      semanticThreshold: 0.1,
      loadTransformers: async () => ({
        pipeline: async () => async () => ({ data: [1, 0, 0, 0] }),
      }),
    });
    await search.initSemantic();
    (search as unknown as { _vectors: Array<{ id: string; embedding: number[] }> })._vectors = [
      { id: 'ghost', embedding: [1, 0, 0, 0] },
      { id: mockDocs[0].id, embedding: [0.9, 0.1, 0, 0] },
    ];
    const result = await search.search('truthiness', { mode: 'semantic' });
    expect(result.merged.every((m) => m.doc.id !== 'ghost')).toBe(true);
  });

  it('ignores blank onnxWasmPaths and normalizes trailing slash', async () => {
    const wasmEnv = { wasmPaths: 'default' };
    stubFetch();
    const blank = createSearch({
      onnxWasmPaths: '   ',
      loadTransformers: async () => ({
        env: { backends: { onnx: { wasm: wasmEnv } } },
        pipeline: async () => async () => ({ data: [1, 0, 0, 0] }),
      }),
    });
    await blank.initSemantic();
    expect(wasmEnv.wasmPaths).toBe('default');

    HybridSearch.resetCDNCache();
    const withSlash = createSearch({
      onnxWasmPaths: '/wasm',
      loadTransformers: async () => ({
        env: { backends: { onnx: { wasm: wasmEnv } } },
        pipeline: async () => {
          expect(wasmEnv.wasmPaths).toBe('/wasm/');
          return async () => ({ data: [1, 0, 0, 0] });
        },
      }),
    });
    await withSlash.initSemantic();
  });

  it('CDN default loaders warn and throw when all URLs fail', async () => {
    HybridSearch.resetCDNCache();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const search = new HybridSearch({
      indexUrl: 'https://example.test/index.json',
      vectorsUrl: 'https://example.test/vectors.json',
    });
    stubFetch();
    await expect(search.initFuzzy()).rejects.toThrow();
    expect(warn).toHaveBeenCalled();

    HybridSearch.resetCDNCache();
    const semantic = new HybridSearch({
      indexUrl: 'https://example.test/index.json',
      vectorsUrl: 'https://example.test/vectors.json',
      loadFuse: async () => ({ default: Fuse }),
    });
    await expect(semantic.initSemantic()).rejects.toThrow();
  });
});
