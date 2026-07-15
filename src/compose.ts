// Canonical URN composition (specs 027 / 037). Ported verbatim from
// hadron-server src/lib/urn.ts. Emits canonical `hrn:` form.

import { UrnParseError } from './errors.js';
import { CANONICAL_SCHEME, hasSchemePrefix, normalizeScheme } from './scheme.js';
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

/** Strip `hrn:<expected>:` / `urn:<expected>:` prefix if present; reject wrong-type prefixes. */
function stripPrefixOrThrow(urnStr: string, expectedType: 'app' | 'agent'): string {
  if (!urnStr) {
    throw new Error(`composeInstalledAgentUrn: ${expectedType} URN is empty`);
  }
  const normalized = normalizeScheme(urnStr);
  const pfx = `${CANONICAL_SCHEME}:${expectedType}:`;
  if (normalized.startsWith(pfx)) return normalized.slice(pfx.length);
  if (hasSchemePrefix(urnStr)) {
    throw new Error(`composeInstalledAgentUrn: expected hrn:${expectedType}: prefix; got "${urnStr}"`);
  }
  return urnStr;
}

/** Split a slug-path on `::` if present, else on `:` (bridges canonical + legacy grammar). */
function splitMixedGrammar(path: string): string[] {
  return path.includes('::') ? path.split('::') : path.split(':');
}

/**
 * Compose the R2 canonical install URN for an Agent installed in an App
 * (spec 021 D10 / FR-009): `hrn:agent:<installing-org>::<app-slug>::<author-org>:<agent-slug>`.
 * Inputs MUST be 2-segment (org + slug) URNs. Install-by-self collapses via cat 1.
 */
export function composeInstalledAgentUrn(appUrn: string, agentUrn: string): string {
  const appSegments = splitMixedGrammar(stripPrefixOrThrow(appUrn, 'app'));
  const agentSegments = splitMixedGrammar(stripPrefixOrThrow(agentUrn, 'agent'));
  if (appSegments.length !== 2) {
    throw new Error(
      `composeInstalledAgentUrn: appUrn must have exactly <org>::<slug> shape (2 segments); got "${appUrn}" (${appSegments.length} segments)`,
    );
  }
  if (agentSegments.length !== 2) {
    throw new Error(
      `composeInstalledAgentUrn: agentUrn must have exactly <author-org>::<slug> shape (2 segments); got "${agentUrn}" (${agentSegments.length} segments)`,
    );
  }
  const raw = `${CANONICAL_SCHEME}:agent:${appSegments[0]!}::${appSegments[1]!}::${agentSegments[0]!}:${agentSegments[1]!}`;
  return toParserCanonical(raw);
}
