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
  validateAtomShape, validateUserSlug, validateOrgSlug, deriveSlugFromName,
} from './slug.js';
export { parseUrnInput, formatUrn, validateUrnType } from './legacy.js';
export type { LegacyUrnType, LegacyParsedUrn } from './legacy.js';
export { parseUrn, isParserCanonical, toParserCanonical } from './parser.js';
export type { ParsedUrn } from './parser.js';
export { formatCanonicalUrn, composeNodeUrn, composeEdgeUrn } from './compose.js';
