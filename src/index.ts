export {
  HybridSearch,
  cosineSimilarity,
  rankBySimilarity,
  VDL_HYBRID_SEARCH_VERSION,
  DEFAULT_DOCS_BASE_URL,
} from './hybrid-search.js';

export type {
  HybridSearchOptions,
  SearchDocument,
  SearchResult,
  SearchMode,
  MergedHit,
  FuzzyHit,
  SemanticHit,
  SemanticProgress,
  TitleMatch,
} from './hybrid-search.js';

export {
  normalizeSearchQuery,
  validateSearchQuery,
  validateSearchIndexDocument,
  validateSearchIndexPayload,
  validateVectorPayload,
  safeDocHref,
  sanitizeIconClass,
  searchGuardrails,
  VD_GUARDRAILS_VERSION,
} from './guardrails/search.js';
