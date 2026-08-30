/**
 * Adaptive confidence cutoff for merged search hits.
 * Ported from vd3-docs embeddinggemma tuning.
 */

import type { MergedHit } from './hybrid-search.js';

export type ConfidenceOptions = {
  /** Absolute floor — junk never shows even if it is the only hit. */
  absFloor?: number;
  /** If the best hit is weaker than this, return no results. */
  minTopScore?: number;
  /** Keep hits at least this fraction of the top score. */
  relativeTopFraction?: number;
  /** Weak body-only fuzzy near-misses must be close to the top score. */
  weakBodyRelative?: number;
};

export const DEFAULT_CONFIDENCE: Required<ConfidenceOptions> = {
  absFloor: 0.22,
  minTopScore: 0.53,
  relativeTopFraction: 0.45,
  weakBodyRelative: 0.85,
};

export function adaptiveCutoff(topScore: number, opts: Required<ConfidenceOptions>): number {
  if (!(topScore > 0) || !Number.isFinite(topScore)) return opts.absFloor;
  return Math.max(opts.absFloor, topScore * opts.relativeTopFraction);
}

export function filterConfidentHits(
  hits: MergedHit[],
  options: ConfidenceOptions = {},
): MergedHit[] {
  if (!hits.length) return [];
  const opts = { ...DEFAULT_CONFIDENCE, ...options };
  const ranked = [...hits].sort((a, b) => b.score - a.score);
  const top = ranked[0]?.score ?? 0;
  if (!(top >= opts.minTopScore)) return [];
  const cutoff = adaptiveCutoff(top, opts);
  const weakFloor = Math.max(cutoff, top * opts.weakBodyRelative);
  return ranked.filter((hit) => {
    if (!(hit.score >= cutoff)) return false;
    if (hit.source === 'fuzzy' && hit.weakMatch && hit.titleMatch === 'none') {
      return hit.score >= weakFloor;
    }
    return true;
  });
}
