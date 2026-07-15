// Normalization helpers. Ported verbatim from hadron-server src/lib/urn.ts.

import { MEMORY_ROLE_MARKERS } from './registry.js';

/**
 * Collapse the canonical `::` hierarchy form to the bare single-colon lookup
 * form. The `::` form is emission-side sugar; storage/lookup is single-colon.
 */
export function normalizeUrnForLookup(bareUrn: string): string {
  return bareUrn.includes('::') ? bareUrn.split('::').join(':') : bareUrn;
}

/**
 * Convert a bare legacy single-colon memory URN to canonical `::` hierarchy,
 * preserving the `marker:id` boundary for role-marker memories.
 *
 *   `org:agent:app-user:id` -> `org::agent::app-user:id`
 *   `org:agent:anon:id`     -> `org::agent::anon:id`
 *   `org:specs`             -> `org::specs`
 *
 * Input MUST be the bare legacy form (no scheme prefix, single-colon separators).
 */
export function legacyMemoryUrnToCanonical(bareLegacyUrn: string): string {
  const parts = bareLegacyUrn.split(':');
  let markerIdx = -1;
  for (let i = parts.length - 1; i >= 0; i--) {
    if (MEMORY_ROLE_MARKERS.includes(parts[i]!)) {
      markerIdx = i;
      break;
    }
  }
  if (markerIdx < 0) return parts.join('::');
  const beforeMarker = parts.slice(0, markerIdx).join('::');
  const marker = parts[markerIdx];
  const afterMarker = parts.slice(markerIdx + 1).join(':');
  return afterMarker ? `${beforeMarker}::${marker}:${afterMarker}` : `${beforeMarker}::${marker}`;
}

/**
 * Extract an agent's slug path from its URN, stripping the leading org segment.
 * Robust to both legacy single-colon (`org:slug`) and canonical double-colon
 * (`org::slug`) forms (collapses `::`->`:` first).
 */
export function agentSlugFromUrn(agentUrn: string): string {
  return normalizeUrnForLookup(agentUrn).split(':').slice(1).join(':');
}
