// Slug validation + derivation. Ported verbatim from hadron-server src/lib/urn.ts.

import { UrnParseError } from './errors.js';
import { RESERVED_SLUGS } from './registry.js';
import { hasSchemePrefix } from './scheme.js';

/**
 * The maximum length of a single URN atom / slug, in characters (spec
 * `cor:urn:010:01`, FR-017). Exported as the single source of truth so lib
 * internals AND server-side minters (`mintLocalSlug`, the handle generator)
 * stop re-typing the bare literal `64` (#715).
 */
export const MAX_ATOM_LEN = 64;

const ATOM_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*[a-zA-Z0-9]$|^[a-zA-Z0-9]$/;

/**
 * Parse-time atom shape check: FR-016 charset + FR-017 length only.
 * Deliberately case-LENIENT (charset allows `A-Z`) — the read/parse path stays
 * lenient so pre-existing uppercase URNs still resolve; the lowercase-only rule
 * (#575) is enforced at create/rename in {@link validateUserSlug}.
 */
export function validateAtomShape(input: string, atom: string): void {
  if (atom.length === 0) {
    throw new UrnParseError(input, 'invalid-segment-shape', atom);
  }
  if (atom.length > MAX_ATOM_LEN) {
    throw new UrnParseError(input, 'slug-too-long', atom);
  }
  if (!ATOM_RE.test(atom)) {
    throw new UrnParseError(input, 'invalid-charset', atom);
  }
}

/**
 * Entity-CREATE/RENAME-time slug validation: FR-016 charset + FR-017 length +
 * FR-019 reserved-word rejection + the #575 lowercase-canonical rule. Throws
 * `UrnParseError` on any violation.
 */
export function validateUserSlug(slug: string): void {
  validateAtomShape(slug, slug);
  // Reserved-word check first (case-insensitive), so `Agent` reports
  // `reserved-word-slug` rather than the case error.
  if (RESERVED_SLUGS.has(slug.toLowerCase())) {
    throw new UrnParseError(slug, 'reserved-word-slug', slug);
  }
  if (/[A-Z]/.test(slug)) {
    throw new UrnParseError(slug, 'slug-not-lowercase', slug);
  }
}

/**
 * Validate an organization slug at create/rename boundaries (#376, #692). An org
 * URN stores the BARE slug and must never itself contain a `:` (the prefix-boundary
 * invariant the rename cascade relies on), so a scheme prefix or `:` is rejected
 * up front; everything else reuses the shared slug rules. A **NEW** org root must
 * additionally be a **dotted domain** (#692 registration policy — dotted roots are
 * domain-verifiable and stay charset-disjoint from dot-free user handles in the
 * shared principal pool). This is a create/rename rule, NOT a parse rule: existing
 * undotted org roots still resolve on the read path.
 */
export function validateOrgSlug(slug: string): void {
  if (hasSchemePrefix(slug) || slug.includes(':')) {
    throw new UrnParseError(slug, 'org-urn-not-bare', slug);
  }
  validateUserSlug(slug);
  if (!slug.includes('.')) {
    throw new UrnParseError(slug, 'org-root-not-dotted', slug);
  }
}

/**
 * Validate a user handle at create/rename boundaries (#692). A handle is a
 * `validateUserSlug` slug that additionally must be **dot-free** — so it stays
 * charset-disjoint from a dotted org root in the shared principal pool (an org
 * root is a domain, a handle is not). Registration policy, not a parse rule:
 * pre-existing dotted handles still resolve on the read path.
 */
export function validateUserHandle(handle: string): void {
  validateUserSlug(handle);
  if (handle.includes('.')) {
    throw new UrnParseError(handle, 'handle-has-dot', handle);
  }
}

/**
 * Derive a valid, lowercase URN slug atom from a free-form display name (#574).
 * Lowercases, maps out-of-charset runs to a single hyphen, trims leading/
 * trailing punctuation, and caps to the 64-char atom limit. Slugification only —
 * it does NOT reject reserved words. Throws `empty-derived-slug` when nothing
 * usable survives.
 */
export function deriveSlugFromName(name: string): string {
  let slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '');
  if (slug.length > MAX_ATOM_LEN) {
    slug = slug.slice(0, MAX_ATOM_LEN).replace(/[._-]+$/g, '');
  }
  if (!slug) {
    throw new UrnParseError(name, 'empty-derived-slug', name);
  }
  return slug;
}

/**
 * Boolean form of {@link validateUserSlug}: `true` when `slug` is a legal NEW
 * entity slug (FR-016 charset + FR-017 length + FR-019 reserved-word + the #575
 * lowercase-canonical rule), `false` on any violation. Convenience wrapper for
 * callers that want a predicate instead of a throw (#715).
 */
export function isValidSlug(slug: string): boolean {
  try {
    validateUserSlug(slug);
    return true;
  } catch {
    return false;
  }
}
