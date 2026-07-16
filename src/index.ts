// @hadron-memory/urn-lib-js — public API.
//
// Increment 1 (this release): the pure "scheme + registry + normalize + slug"
// core, ported verbatim (v1 parity) from hadron-server src/lib/urn.ts behind
// the shared fixture corpus (fixtures/corpus.json). The parse (`parseUrn`),
// format, and compose surfaces — plus the grammar-v2 flat forms — land in
// later increments (hadron-server#693/#694), gated by the same corpus.

export { CANONICAL_SCHEME, LEGACY_SCHEME, hasSchemePrefix, normalizeScheme } from './scheme.js';
export {
  CORE_TYPES, NODE_TYPES, NODE_ROLES, NODE_PARTS, URN_TYPES, URN_TYPE_SET,
  ROLE_MARKERS, MEMORY_ROLE_MARKERS, TYPE_MARKERS, NODE_URN_TYPES, RESERVED_SLUGS,
} from './registry.js';
export type { CanonicalUrnType, AliasCategory } from './registry.js';
export { UrnParseError } from './errors.js';
export type { UrnParseErrorReason } from './errors.js';
export {
  normalizeUrnForLookup, legacyMemoryUrnToCanonical, agentSlugFromUrn,
} from './normalize.js';
export {
  validateAtomShape, validateUserSlug, validateOrgSlug, validateUserHandle, deriveSlugFromName,
} from './slug.js';
export { parseUrnInput, formatUrn, validateUrnType } from './legacy.js';
export type { LegacyUrnType, UrnType, LegacyParsedUrn } from './legacy.js';
export { parseUrn, isParserCanonical, toParserCanonical } from './parser.js';
export type { ParsedUrn } from './parser.js';
export {
  formatCanonicalUrn, composeNodeUrn, composeEdgeUrn, composeInstalledAgentUrn,
} from './compose.js';
export { assertFullyQualifiedUrn, splitNodeUrn, UrnNotQualifiedError } from './qualify.js';
export type { ExpectedUrnType } from './qualify.js';
export { parseFor } from './migrate.js';
export type { UrnRow } from './migrate.js';
export { DISPLAY_URN_TYPES, parseDisplayUrn } from './display.js';
export type { DisplayUrnType, DisplayParsedUrnType, ParsedDisplayUrn } from './display.js';
// Grammar v2 (flat, pool-rooted) — additive, coexists with the v1 surface (#694).
// Per-entity shapes + typed compose/parse helpers land in #696.
export {
  V2_URN_TYPES, parseUrnV2, composeUrnV2, isFlatV2,
  composeSecretUrnV2, composeAppRunUrnV2, composeNodeRevUrnV2, composeDataFragmentV2,
  parseNodeRevUrnV2,
} from './v2.js';
export type { V2UrnType, ParsedUrnV2, ParsedNodeRevUrnV2 } from './v2.js';
