// Scheme prefix (issue #239). `hrn:` (Hadron Resource Name, AWS-`arn:`-style)
// is the CANONICAL prefix; the legacy `urn:` prefix is accepted on input
// forever — no deprecation. Every emission path composes `hrn:`.

/** The canonical scheme prefix composed on every emission path. */
export const CANONICAL_SCHEME = 'hrn';

/** The legacy scheme prefix, accepted on input forever (issue #239). */
export const LEGACY_SCHEME = 'urn';

const SCHEME_PREFIX_RE = /^(?:hrn|urn):/;

/** True when the input leads with a scheme prefix (`hrn:` or legacy `urn:`). */
export function hasSchemePrefix(input: string): boolean {
  return SCHEME_PREFIX_RE.test(input);
}

/**
 * Rewrite a leading legacy `urn:` scheme to canonical `hrn:`. Inputs without a
 * scheme prefix (bare URNs) and already-canonical inputs pass through.
 */
export function normalizeScheme(input: string): string {
  return input.startsWith('urn:') ? `hrn:${input.slice(4)}` : input;
}
