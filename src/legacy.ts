// Legacy (pre-spec-021) URN format/parse/validate surface. Ported verbatim
// from hadron-server src/lib/urn.ts. New code should prefer the canonical
// parser (a later increment); these exist for callers that predate it.

import { CANONICAL_SCHEME } from './scheme.js';

const LEGACY_URN_TYPES = ['org', 'memory', 'agent', 'app', 'node', 'edge', 'user'] as const;

/** The small pre-021 type union, plus `loc` and `unknown`. */
export type LegacyUrnType = (typeof LEGACY_URN_TYPES)[number] | 'loc' | 'unknown';

/** Backward-compat alias for the pre-spec-021 `UrnType` symbol. */
export type UrnType = LegacyUrnType;

export interface LegacyParsedUrn {
  type: LegacyUrnType;
  value: string;
}

const LEGACY_URN_RE = /^(?:hrn|urn):(org|memory|agent|app|node|edge|user):(.+)$/;
const LOC_RE = /^loc:(.+)$/;

/**
 * Parse a URN input string, stripping the `hrn:`/`urn:<type>:` or `loc:` prefix.
 * Returns the type and bare value. Unprefixed inputs are returned as type
 * `'unknown'` for backwards compatibility.
 */
export function parseUrnInput(input: string): LegacyParsedUrn {
  const match = input.match(LEGACY_URN_RE);
  if (match) return { type: match[1] as LegacyUrnType, value: match[2]! };
  const locMatch = input.match(LOC_RE);
  if (locMatch) return { type: 'loc', value: locMatch[1]! };
  return { type: 'unknown', value: input };
}

/** Format a bare value as a typed canonical URN string for display/output. */
export function formatUrn(type: string, value: string): string {
  return `${CANONICAL_SCHEME}:${type}:${value}`;
}

/**
 * Validate that a parsed URN matches the expected type. Returns an error
 * message string if mismatched, or `null` if ok. Type `'unknown'` (unprefixed
 * input) is always accepted; `'loc'` is accepted where `node` is expected.
 */
export function validateUrnType(parsed: LegacyParsedUrn, expected: LegacyUrnType): string | null {
  if (parsed.type === 'unknown') return null;
  if (parsed.type === expected) return null;
  if (parsed.type === 'loc' && expected === 'node') return null;
  return `Expected ${expected} URN (hrn:${expected}:...), got hrn:${parsed.type}:...`;
}
