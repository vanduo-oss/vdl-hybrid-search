import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import Fuse from 'fuse.js';
import {
  HybridSearch,
  cosineSimilarity,
  rankBySimilarity,
  VDL_HYBRID_SEARCH_VERSION,
} from '../src/index.js';
import {
  validateSearchIndexPayload,
  validateSearchQuery,
} from '../src/guardrails/search.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const fixture = JSON.parse(
  readFileSync(join(root, 'tests/fixtures/curriculum-search-index.json'), 'utf8'),
);

const mockDocs = fixture.documents;

describe('smoke', () => {
  it('version matches package.json', () => {
    expect(VDL_HYBRID_SEARCH_VERSION).toBe(pkg.version);
  });
});

describe('math helpers', () => {
  it('cosineSimilarity of identical vectors is 1', () => {
    const vec = [0.5, 0.5, 0.5, 0.5];
    expect(cosineSimilarity(vec, vec)).toBeCloseTo(1, 5);
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
});

describe('search guardrails', () => {
  it('rejects short queries', () => {
    expect(validateSearchQuery('a').allowed).toBe(false);
  });

  it('accepts curriculum fixture', () => {
    expect(validateSearchIndexPayload(fixture).allowed).toBe(true);
  });
});

describe('HybridSearch', () => {
  it('mergeResults caps and dedupes', async () => {
    const search = new HybridSearch({
      maxResults: 2,
      loadFuse: async () => ({ default: Fuse }),
      loadTransformers: async () => {
        throw new Error('no semantic in unit test');
      },
    });
    // Seed docs without fetch
    (search as any)._docs = mockDocs;
    (search as any)._docMap = new Map(mockDocs.map((d: { id: string }) => [d.id, d]));

    const fuzzy = [
      { item: mockDocs[0], score: 0.1 },
      { item: mockDocs[1], score: 0.2 },
    ];
    const semantic = [
      { id: mockDocs[0].id, score: 0.9 },
      { id: mockDocs[1].id, score: 0.8 },
    ];
    const merged = search.mergeResults(fuzzy, semantic);
    expect(merged.length).toBe(2);
    expect(new Set(merged.map((m) => m.doc.id)).size).toBe(2);
  });

  it('fuzzy search works with injected Fuse and mock fetch', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => fixture,
      })),
    );

    const search = new HybridSearch({
      indexUrl: 'https://example.test/index.json',
      vectorsUrl: 'https://example.test/vectors.json',
      loadFuse: async () => ({ default: Fuse }),
      loadTransformers: async () => {
        throw new Error('semantic unavailable');
      },
    });

    await search.initFuzzy();
    const result = await search.search(mockDocs[0].title.slice(0, 12), { mode: 'fuzzy' });
    expect(result.merged.length).toBeGreaterThan(0);
    expect(result.merged[0].source).toBe('fuzzy');

    vi.unstubAllGlobals();
  });
});
