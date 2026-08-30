/**
 * Embedding model presets — single source of truth for model selection.
 * Indexers and HybridSearch both resolve presets from this table.
 */

export type EmbeddingPresetId = 'embeddinggemma' | 'minilm' | 'e5' | 'none';

export type EmbeddingPresetConfig = {
  modelName: string;
  dtype: string;
  dimensions: number;
  /** Prepended to query text before embedding (empty = none). */
  queryPrefix: string;
  /** Whether document text uses title-aware prefixing at index time. */
  usesDocumentPrefix: boolean;
};

export const EMBEDDING_PRESETS: Record<
  Exclude<EmbeddingPresetId, 'none'>,
  EmbeddingPresetConfig
> = {
  embeddinggemma: {
    modelName: 'onnx-community/embeddinggemma-300m-ONNX',
    dtype: 'q8',
    dimensions: 768,
    queryPrefix: 'task: search result | query: ',
    usesDocumentPrefix: true,
  },
  minilm: {
    modelName: 'Xenova/all-MiniLM-L6-v2',
    dtype: 'q8',
    dimensions: 384,
    queryPrefix: '',
    usesDocumentPrefix: false,
  },
  e5: {
    modelName: 'Xenova/multilingual-e5-small',
    dtype: 'q8',
    dimensions: 384,
    queryPrefix: 'query: ',
    usesDocumentPrefix: true,
  },
};

export const QUERY_PREFIX_GEMMA = EMBEDDING_PRESETS.embeddinggemma.queryPrefix;

/** Apply the active query prefix unless the text already looks prefixed. */
export function prefixQuery(text: string, queryPrefix: string): string {
  const raw = String(text || '').trim();
  if (!queryPrefix) return raw;
  if (raw.startsWith(queryPrefix)) return raw;
  if (raw.startsWith('task:') || raw.startsWith('query:') || raw.startsWith('title:'))
    return raw;
  return `${queryPrefix}${raw}`;
}

/** Build document embedding text with optional title prefix (EmbeddingGemma / E5 style). */
export function prefixDocument(
  title: string,
  text: string,
  options: { preset?: EmbeddingPresetId; queryPrefix?: string } = {},
): string {
  const presetId = options.preset ?? 'embeddinggemma';
  const t =
    String(title || 'none')
      .replace(/\s+/g, ' ')
      .trim() || 'none';
  const body = String(text || '').trim();

  if (presetId === 'e5') {
    return `passage: ${t}. ${body}`.trim();
  }
  if (presetId === 'embeddinggemma' || options.queryPrefix === QUERY_PREFIX_GEMMA) {
    return `title: ${t} | text: ${body}`;
  }
  return body || t;
}

/** Flatten doc fields into embeddable text (indexer helper). */
export function documentEmbedText(doc: {
  title?: string;
  category?: string;
  keywords?: string[];
  headings?: string[];
  bodyText?: string;
}): string {
  const parts = [
    Array.isArray(doc.keywords) ? doc.keywords.join('. ') : '',
    Array.isArray(doc.headings) ? doc.headings.join('. ') : '',
    doc.category || '',
    doc.bodyText || '',
  ].filter(Boolean);
  return parts.join('. ');
}

export function resolvePresetConfig(
  presetId: EmbeddingPresetId,
): EmbeddingPresetConfig | null {
  if (presetId === 'none') return null;
  return EMBEDDING_PRESETS[presetId];
}
