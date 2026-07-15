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

// Ported verbatim from hadron-server src/lib/urn.ts so error messages are
// byte-identical to the original (Constitution Principle III phrasing).
function messageFor(input: string, reason: UrnParseErrorReason, offending?: string): string {
  const cite = offending && offending !== input ? ` (offending: "${offending}")` : '';
  switch (reason) {
    case 'unknown-type':
      return `URN "${input}" uses an unknown type. The type segment after the scheme prefix ("hrn:" or legacy "urn:") must be one of the registered types.`;
    case 'malformed-grammar':
      return `URN "${input}" does not match the expected "hrn:<type>:<path>" grammar${cite} (legacy "urn:" scheme also accepted).`;
    case 'empty-segment':
      return `URN "${input}" contains an empty path-segment (caused by "::::" or similar). Each "::"-separated piece must be non-empty.`;
    case 'trailing-double-colon':
      return `URN "${input}" ends with "::". Remove the trailing separator.`;
    case 'reserved-word-slug':
      return `Slug${cite} is a reserved word and cannot be used. Reserved words are URN type names (agent, app, memory, …) and memory role markers (system, app-user, priv, …). Pick a different name.`;
    case 'invalid-charset':
      return `Slug${cite} contains characters outside the allowed set. Slugs may use letters, digits, dots, underscores, and hyphens; they must start and end with a letter or digit.`;
    case 'slug-not-lowercase':
      return `Slug "${input}" must be lowercase. URN lookups are case-sensitive, so "${input}" and "${input.toLowerCase()}" would be distinct entities — use "${input.toLowerCase()}".`;
    case 'slug-too-long':
      return `Slug${cite} exceeds the 64-character limit. Pick a shorter name.`;
    case 'loc-segment-rejected':
      return `URN "${input}" contains a "loc:" segment. The "loc:" prefix is deprecated; rewrite the URN using the current grammar.`;
    case 'invalid-segment-shape':
      return `URN path-segment${cite} has the wrong number of ":"-separated parts for its position. See FR-020 internal-":" shape rules.`;
    case 'empty-bare-value':
      return `formatCanonicalUrn called with empty bareValue. A bare URN value MUST contain at least one slug atom.`;
    case 'already-prefixed-bare-value':
      return `formatCanonicalUrn bareValue${cite} starts with a scheme prefix ("hrn:" or "urn:"). Pass the bare value (no "hrn:<type>:" prefix); the wrapper composes the prefix itself.`;
    case 'org-urn-not-bare':
      return `Organization URN "${input}" must be a bare slug — no scheme prefix ("hrn:"/"urn:") and no ":" separator. The Organization.urn field returns the canonical "hrn:org:<slug>" form on read; submit only the bare "<slug>" (e.g. "acme.com").`;
    case 'empty-derived-slug':
      return `Cannot derive a URN slug from "${input}" — it has no letters or digits. Choose a name with at least one alphanumeric character.`;
  }
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
