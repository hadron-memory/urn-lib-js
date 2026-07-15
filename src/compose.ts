// Canonical URN composition (specs 027 / 037). Ported verbatim from
// hadron-server src/lib/urn.ts. Emits canonical `hrn:` form.

import { UrnParseError } from './errors.js';
import { CANONICAL_SCHEME } from './scheme.js';
import { hasSchemePrefix } from './scheme.js';
import { type CanonicalUrnType } from './registry.js';
import { toParserCanonical } from './parser.js';

/**
 * Compose and canonicalize a full URN from an entity type and a bare-stored
 * value (legacy single-colon or canonical `::` hierarchy). Always returns the
 * canonical `hrn:<type>:` form. Throws `empty-bare-value` /
 * `already-prefixed-bare-value` / any `parseUrn` violation.
 */
export function formatCanonicalUrn(type: CanonicalUrnType, bareValue: string): string {
  if (bareValue == null || bareValue.trim().length === 0) {
    throw new UrnParseError('', 'empty-bare-value');
  }
  if (hasSchemePrefix(bareValue)) {
    throw new UrnParseError(bareValue, 'already-prefixed-bare-value', bareValue);
  }
  // Promote legacy single-colon hierarchy to canonical `::` only when NO `::`
  // is present (once any canonical separator exists, remaining single colons
  // are intentional — e.g. the R2 author segment).
  const normalized = bareValue.includes('::') ? bareValue : bareValue.split(':').join('::');
  return toParserCanonical(`${CANONICAL_SCHEME}:${type}:${normalized}`);
}

/**
 * Shared core: canonicalize the memory URN to a known-shape bare form, then
 * attach `loc` as a single leaf path-segment with `::` (so a multi-atom loc
 * stays one leaf rather than being re-split into hierarchy levels).
 */
function composeMemoryScopedUrn(type: 'node' | 'edge', memUrn: string, loc: string): string {
  const memCanonical = formatCanonicalUrn('memory', memUrn);
  const bareMemCanonical = memCanonical.substring(`${CANONICAL_SCHEME}:memory:`.length);
  return `${CANONICAL_SCHEME}:${type}:${bareMemCanonical}::${loc}`;
}

/** Build a canonical `hrn:node:<mem>::<loc>` URN from a memory URN + node loc. */
export function composeNodeUrn(memUrn: string, loc: string): string {
  return composeMemoryScopedUrn('node', memUrn, loc);
}

/** Build a canonical `hrn:edge:<mem>::<loc>` URN from a memory URN + edge loc. */
export function composeEdgeUrn(memUrn: string, loc: string): string {
  return composeMemoryScopedUrn('edge', memUrn, loc);
}
