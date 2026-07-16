// Display-chip parser/registry (spec-010). Ported from hadron-portal's
// src/lib/urn/parse-urn.ts so downstream UI code no longer carries its own kind
// regex (issue #1). This is DELIBERATELY separate from the canonical parser
// (`parseUrn`): it is tolerant for rendering, splits a displayable URN into
// `{ type, bareValue, fullUrn }`, accepts legacy `urn:` input, always emits
// canonical `hrn:`, and falls back to `unknown` when a visible kind is missing
// from the display registry — which keeps UI-registration gaps visible
// (hadron-portal#393). Strict validation/canonical grammar still belongs to
// `parseUrn` and the grammar corpus.

import { CANONICAL_SCHEME } from './scheme.js';

/**
 * The visible URN kinds the display layer renders as a typed chip. This is
 * DELIBERATELY narrower than the canonical registry: a new visible URN kind
 * must be added here too, or `parseDisplayUrn` renders it as
 * `hrn:unknown:...`. That gap is intentional — it makes missing display
 * registration visually obvious rather than silently mislabeling a chip.
 */
export const DISPLAY_URN_TYPES = [
  'org', 'memory', 'agent', 'app', 'node', 'user', 'apprun',
] as const;

/** A registered display kind. */
export type DisplayUrnType = (typeof DISPLAY_URN_TYPES)[number];

/** A display kind, or the `unknown` fallback for an unregistered/missing kind. */
export type DisplayParsedUrnType = DisplayUrnType | 'unknown';

export interface ParsedDisplayUrn {
  /** The detected or supplied type segment. `'unknown'` when nothing fits. */
  type: DisplayParsedUrnType;
  /** Everything after `hrn:<type>:` — the full post-kind value, not truncated. */
  bareValue: string;
  /** Canonical full URN reconstruction: `hrn:<type>:<bareValue>`. */
  fullUrn: string;
}

// The display regex stays narrow (registered display kinds only). The canonical
// parser knows the full grammar; this regex only extracts a scheme-prefixed
// (`hrn:` canonical or legacy `urn:`) display kind for the chip's type badge.
// Unregistered kinds fall through to `unknown` so missing display registration
// stays visually obvious. Built from DISPLAY_URN_TYPES so the registry is the
// single source of truth.
const DISPLAY_URN_REGEX = new RegExp(
  `^(?:hrn|urn):(${DISPLAY_URN_TYPES.join('|')}):(.+)$`,
);

/**
 * Parse a displayable URN for chip rendering. Auto-detects the type from a
 * scheme prefix (`hrn:<type>:` or legacy `urn:<type>:`) on `value` if present;
 * falls back to the supplied `typeHint`; final fallback is `'unknown'`.
 * `bareValue` preserves the full post-kind value (all colon-separated
 * segments), and `fullUrn` is emitted in canonical `hrn:` form regardless of
 * the input scheme.
 */
export function parseDisplayUrn(
  value: string,
  typeHint?: DisplayUrnType,
): ParsedDisplayUrn {
  const match = value.match(DISPLAY_URN_REGEX);
  if (match) {
    const type = match[1] as DisplayUrnType;
    const bareValue = match[2]!;
    return { type, bareValue, fullUrn: `${CANONICAL_SCHEME}:${type}:${bareValue}` };
  }

  if (typeHint) {
    return { type: typeHint, bareValue: value, fullUrn: `${CANONICAL_SCHEME}:${typeHint}:${value}` };
  }

  // No detectable type and no caller-supplied hint — render as `unknown` so the
  // gap is visually obvious. The calling scope should always specify a type;
  // reaching this branch signals a missing type at the caller.
  return { type: 'unknown', bareValue: value, fullUrn: `${CANONICAL_SCHEME}:unknown:${value}` };
}
