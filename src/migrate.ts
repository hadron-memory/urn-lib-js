// Per-row migration gate (spec 021 FR-032). Ported verbatim from hadron-server
// src/lib/urn.ts. NOTE: this is the online-migration dispatch keyed on a DB
// row's `urnNormalizedAt` — transient by design (removed once every row is
// normalized) and arguably server-specific; kept here for surface completeness.

import { UrnParseError } from './errors.js';
import { normalizeScheme } from './scheme.js';
import { parseUrn } from './parser.js';
import { parseUrnInput } from './legacy.js';

/** Minimal row shape for `parseFor` — the URN and the migration gate. */
export interface UrnRow {
  urn: string;
  urnNormalizedAt: Date | null;
}

/**
 * Per-row parser dispatch. A normalized row (`urnNormalizedAt` set) is parsed
 * with the canonical parser and its stored URN returned unchanged (drift from
 * canonical throws, scheme differences tolerated per #239). A legacy row is
 * validated with the legacy parser (a genuinely unknown shape throws).
 */
export function parseFor(row: UrnRow): { canonical: string; isLegacy: boolean } {
  if (row.urnNormalizedAt !== null) {
    const parsed = parseUrn(row.urn);
    if (parsed.parserCanonical !== normalizeScheme(row.urn)) {
      throw new UrnParseError(row.urn, 'malformed-grammar');
    }
    return { canonical: row.urn, isLegacy: false };
  }
  const legacy = parseUrnInput(row.urn);
  if (legacy.type === 'unknown') {
    throw new UrnParseError(row.urn, 'malformed-grammar');
  }
  return { canonical: row.urn, isLegacy: true };
}
