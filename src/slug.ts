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

/** Registration-only root policy (cor:urn:010:01); parse/compose stay lenient. */
function validatePrincipalRoot(root: string): void {
  // Scheme words are reserved only as roots, not as generic resource slugs.
  if (root.toLowerCase() === 'hrn' || root.toLowerCase() === 'urn') {
    throw new UrnParseError(root, 'reserved-word-slug', root);
  }
  validateUserSlug(root);
  // Exactly the ID shapes the server's entityRef/shape.ts dispatches as ids.
  if (/^[0-9a-f]{32}$/.test(root) || /^c[a-z0-9]{24}$/.test(root)) {
    throw new UrnParseError(root, 'root-id-shaped', root);
  }
}

/**
 * Validate an org root at create/rename: bare, legal lowercase atom, neither
 * reserved nor ID-shaped. A dot has no meaning; dotted and undotted names are
 * admitted. Existing URNs remain readable through the lenient parse path.
 */
export function validateOrgSlug(slug: string): void {
  if (hasSchemePrefix(slug) || slug.includes(':')) {
    throw new UrnParseError(slug, 'org-urn-not-bare', slug);
  }
  validatePrincipalRoot(slug);
}

/** Validate a new user handle: the root policy above, plus the existing dot-free rule. */
export function validateUserHandle(handle: string): void {
  validatePrincipalRoot(handle);
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
