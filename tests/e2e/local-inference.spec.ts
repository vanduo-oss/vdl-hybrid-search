import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import Fuse from 'fuse.js';
import { env, pipeline } from '@huggingface/transformers';
import { HybridSearch } from '../../src/index.js';
import { readFileSync } from 'node:fs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const fixture = JSON.parse(
  readFileSync(join(root, 'tests/fixtures/curriculum-search-index.json'), 'utf8'),
) as {
  documents: Array<{ id: string; title: string; bodyText: string }>;
};

const cacheDir = join(dirname(fileURLToPath(import.meta.url)), '.model-cache');
mkdirSync(cacheDir, { recursive: true });
env.cacheDir = cacheDir;
env.allowLocalModels = true;

type Extractor = (
  text: string,
  opts: { pooling: string; normalize: boolean },
) => Promise<{ data: ArrayLike<number> }>;

let extractor: Extractor;
let vectorsPayload: { documents: Array<{ id: string; embedding: number[] }> };

beforeAll(async () => {
  // Transformers.js typings for pipeline options vary by version; use a loose call.
  const createExtractor = pipeline as unknown as (
    task: string,
    model: string,
    options?: Record<string, unknown>,
  ) => Promise<Extractor>;
  extractor = await createExtractor('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
    quantized: true,
  });

  const documents = [];
  for (const doc of fixture.documents) {
    const text = `${doc.title}. ${doc.bodyText}`;
    const output = await extractor(text, { pooling: 'mean', normalize: true });
    documents.push({ id: doc.id, embedding: Array.from(output.data) });
  }
  vectorsPayload = { documents };
}, 300_000);

afterAll(() => {
  vi.unstubAllGlobals();
  HybridSearch.resetCDNCache();
});

describe('local inference e2e', () => {
  it('runs real Fuse fuzzy + MiniLM semantic hybrid search', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).includes('vectors')) {
          return { ok: true, json: async () => vectorsPayload };
        }
        return { ok: true, json: async () => fixture };
      }),
    );

    const search = new HybridSearch({
      indexUrl: 'https://local.test/index.json',
      vectorsUrl: 'https://local.test/vectors.json',
      semanticThreshold: 0.15,
      loadFuse: async () => ({ default: Fuse }),
      loadTransformers: async () => ({
        env,
        pipeline: async () => extractor,
      }),
    });

    await search.initFuzzy();
    const fuzzy = await search.search('truthiness narrowing', { mode: 'fuzzy' });
    expect(fuzzy.merged.length).toBeGreaterThan(0);
    expect(fuzzy.merged.some((m) => m.doc.id === 'truthiness-narrowing')).toBe(true);

    const semantic = await search.search('control flow union narrowing', {
      mode: 'semantic',
    });
    expect(semantic.merged.length).toBeGreaterThan(0);
    expect(semantic.merged.some((m) => m.doc.id === 'truthiness-narrowing')).toBe(true);

    const hybrid = await search.search('narrowing', { mode: 'hybrid' });
    expect(hybrid.merged.length).toBeGreaterThan(0);
    expect(hybrid.merged.some((m) => m.doc.id === 'truthiness-narrowing')).toBe(true);
  }, 300_000);
});
