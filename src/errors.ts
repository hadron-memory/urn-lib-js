// URN error types. Ported verbatim (reason codes) from hadron-server
// src/lib/urn.ts — the reason code is the cross-language contract; the human
// message text is NOT (it may differ per implementation until reconciled).

/** Machine-stable failure reasons. These ARE part of the fixture contract. */
export type UrnParseErrorReason =
  | 'unknown-type' // type after `hrn:`/`urn:` is not in the type registry
  | 'malformed-grammar' // structural parse failure not covered by a more specific reason
  | 'empty-segment' // a `::` produced an empty path-segment
  | 'trailing-double-colon' // URN ends with `::`
  | 'reserved-word-slug' // a slug equals a reserved word (FR-019)
  | 'invalid-charset' // a slug violates the FR-016 charset
  | 'slug-not-lowercase' // a NEW slug contains uppercase (create/rename only; #575)
  | 'slug-too-long' // a slug exceeds the FR-017 64-char limit
  | 'loc-segment-rejected' // URN contains a `loc:` segment (FR-021)
  | 'invalid-segment-shape' // a path-segment violates the FR-020 internal-`:` rules
  | 'empty-bare-value' // formatCanonicalUrn called with empty bareValue
  | 'already-prefixed-bare-value' // formatCanonicalUrn bareValue starts with a scheme
  | 'org-urn-not-bare' // an org slug carried a scheme prefix or `:` separator (#376)
  | 'empty-derived-slug'; // a display name slugified to nothing usable (#574)

function messageFor(input: string, reason: UrnParseErrorReason, segment?: string): string {
  const at = segment && segment !== input ? ` at "${segment}"` : '';
  return `URN parse error [${reason}]${at}: "${input}"`;
}

/** Thrown by every validation/parse entry point on any acceptance violation. */
export class UrnParseError extends Error {
  constructor(
    public readonly input: string,
    public readonly reason: UrnParseErrorReason,
    public readonly offendingSegment?: string,
  ) {
    super(messageFor(input, reason, offendingSegment));
    this.name = 'UrnParseError';
  }
}
