## Context

Dogfood (ts-school) showed fuzzy “getting started” queries ranking `installing-types`
(“Getting types for your dependencies”) without a signal tutors can use to refuse.

## Goals / Non-Goals

**Goals:** Additive options + hit metadata so hosts can filter weak fuzzy matches; defaults unchanged.

**Non-Goals:** Semantic title signals; changing Fuse defaults; shipping deny-list policy in the package.

## Decisions

1. `titleMatch`:
   - `exact` — case-insensitive normalized query equals title
   - `partial` — shared tokens (length ≥ 3) or substring containment (query⊆title or title⊆query)
   - `none` — otherwise
2. `weakMatch: true` when `titleMatch !== 'exact'` on fuzzy-sourced hits; `false` when exact.
3. Semantic hits omit `titleMatch` / `weakMatch`.
4. `fuzzyMinScore` applies after `1 - fuseScore` (+ `titleExactBoost` when exact). Default `0` never filters.
5. `mergeResults` gains optional third arg `query?: string`. Without query, no title fields (BC for direct callers). `search()` always passes the normalized query.

## Risks / Trade-offs

Token overlap of length ≥ 3 can mark weakly related titles as `partial`; consumers should still use score + intent heuristics.

## Migration Plan

No action required for existing hosts. Opt in by reading new fields or setting options.

## Open Questions

- None.
