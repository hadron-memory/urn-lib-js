// API-boundary URN qualification (spec 022). Ported verbatim from hadron-server
// src/lib/urn.ts. assertFullyQualifiedUrn / splitNodeUrn throw
// UrnNotQualifiedError (distinct from UrnParseError) — the boundary gate.

import { UrnParseError } from './errors.js';
import { hasSchemePrefix } from './scheme.js';
import { V2_FRAGMENTS, FRAGMENT_PARENT_TYPES } from './v2.js';

export type ExpectedUrnType =
  | 'org' | 'memory' | 'agent' | 'app' | 'node' | 'edge' | 'user' | 'secret';

const MIN_HIERARCHY_SEGMENTS: Record<ExpectedUrnType, number> = {
  org: 1, memory: 2, agent: 2, app: 2, node: 3, edge: 3, user: 1,
  // Secret (#679): owner-dependent depth — 2 for org-/user-owned, 3 for
  // app-/memory-owned. The gate only checks a minimum, so 2 admits both; the
  // marker structure is validated deeper in the parser.
  secret: 2,
};

const MIN_SEGMENTS_HINT: Record<ExpectedUrnType, string> = {
  org: '1 hierarchy segment (e.g., "acme.com")',
  memory: '2 hierarchy segments (org::memory, e.g., "acme.com::mmdata")',
  agent: '2 hierarchy segments (org::agent-slug, e.g., "acme.com::coding-agent")',
  app: '2 hierarchy segments (org::app-slug, e.g., "acme.com::dev-app")',
  node: '3 hierarchy segments (org::memory::loc, e.g., "acme.com::mmdata::review:sort-imports")',
  edge: '3 hierarchy segments (org::memory::loc, e.g., "acme.com::mmdata::intro:next")',
  user: '1 hierarchy segment (the handle, e.g., "holger")',
  secret: '2+ hierarchy segments (owner root :: [app|memory:slug ::] name, e.g., "acme.com::stripe-key" or "acme.com::app:internal-ops::stripe-key")',
};

/** Node-role types that alias for `node` at the qualification boundary (D11 cat 2). */
const NODE_ROLE_ALIASES: ReadonlySet<string> = new Set<string>([
  'abstract', 'partial', 'parent', 'plan', 'prompt', 'record', 'task', 'review',
  'chat', 'chat-message', 'config', 'conversation', 'event', 'goal', 'stage',
  'condition', 'data',
]);

/**
 * Thrown when a non-ID-shaped input fails URN qualification. Carries a stable
 * `code` (`URN_NOT_QUALIFIED`) — the cross-language contract handle — plus the
 * offending value, expected type, and any underlying parse cause.
 */
export class UrnNotQualifiedError extends Error {
  public readonly code = 'URN_NOT_QUALIFIED';
  public readonly offendingValue: string;
  public readonly expectedType: ExpectedUrnType | undefined;
  public readonly parseCause: UrnParseError | undefined;

  constructor(offendingValue: string, cause?: UrnParseError, expectedType?: ExpectedUrnType) {
    const fixHint = expectedType
      ? `Expected a ${expectedType} URN with at least ${MIN_SEGMENTS_HINT[expectedType]}.`
      : 'Use the canonical form "<org>::<memory>[::path]" — org and memory slugs are mandatory at the API boundary.';
    super(`URN "${offendingValue}" is not fully qualified. ${fixHint}`);
    this.name = 'UrnNotQualifiedError';
    this.offendingValue = offendingValue;
    this.expectedType = expectedType;
    this.parseCause = cause;
  }
}

const QUAL_PREFIX_RE = /^(?:hrn|urn):([a-z][a-z0-9-]*):(.+)$/;
const QUAL_PREFIX_STRIP_RE = /^(?:hrn|urn):[a-z][a-z0-9-]*:(.+)$/;
const TRIPLE_COLON_RE = /:{3,}/;

/**
 * Reject inputs intended as URNs that lack the fully-qualified shape for
 * `expectedType`. Checks SHAPE (segment count + structural integrity), not full
 * canonical grammar. Throws `UrnNotQualifiedError`. Callers MUST filter ID-shape
 * inputs before invoking this.
 */
export function assertFullyQualifiedUrn(input: string, expectedType: ExpectedUrnType): void {
  let path = input;
  let prefixType: string | null = null;
  const prefixMatch = input.match(QUAL_PREFIX_RE);
  if (prefixMatch) {
    prefixType = prefixMatch[1]!;
    path = prefixMatch[2]!;
  } else if (hasSchemePrefix(input)) {
    throw new UrnNotQualifiedError(input, undefined, expectedType);
  }

  if (prefixType === 'loc') {
    throw new UrnNotQualifiedError(input, undefined, expectedType);
  }

  if (prefixType !== null && prefixType !== expectedType) {
    const isNodeRoleAlias = expectedType === 'node' && NODE_ROLE_ALIASES.has(prefixType);
    // The grammar-v2 `mem` type word aliases `memory` at the boundary (#697
    // emission flip), so a v2-emitted `hrn:mem:root:slug` qualifies as a memory.
    const isMemoryAlias = expectedType === 'memory' && prefixType === 'mem';
    if (!isNodeRoleAlias && !isMemoryAlias) {
      throw new UrnNotQualifiedError(input, undefined, expectedType);
    }
  }

  if (TRIPLE_COLON_RE.test(path)) {
    throw new UrnNotQualifiedError(input, undefined, expectedType);
  }

  const segments = path.includes('::') ? path.split('::') : path.split(':');
  if (segments.some((s) => s.length === 0)) {
    throw new UrnNotQualifiedError(input, undefined, expectedType);
  }
  if (segments.length < MIN_HIERARCHY_SEGMENTS[expectedType]) {
    throw new UrnNotQualifiedError(input, undefined, expectedType);
  }
}

/**
 * The decomposition of a node or edge URN. `loc` is GRAMMAR-NORMALIZED: both
 * `hrn:node:acme.com::specs::cor:urn` and `hrn:node:acme.com:specs:cor:urn`
 * yield `cor:urn`, so a caller never has to know which grammar it was handed.
 *
 * This is the reason to prefer these decomposers over `ParsedUrn.pathSegments`,
 * which is a RAW split whose shape follows the input grammar (#12).
 */
export interface NodeLikeUrnParts {
  /** The bare memory URN — `<org>:<memorySlug>`, or the full path for a
   * multi-segment memory (`<org>:<app>:<agent>:<role>`). */
  memoryUrn: string;
  /** The opaque loc within that memory, colon-joined. Never carries a fragment. */
  loc: string;
  /** Present only when the input carried a `#<fragment>` suffix (v2 `#data`). */
  fragment?: string;
}

/**
 * Split a fully-qualified node or edge URN. Shared by `splitNodeUrn` and
 * `splitEdgeUrn` — node and edge have the same `<root>::<mem>::<loc...>` shape,
 * and an edge loc is an opaque terminal (never re-split into `source:target`).
 */
function splitNodeLikeUrn(input: string, expectedType: 'node' | 'edge'): NodeLikeUrnParts {
  // Strip an optional trailing `#<fragment>` FIRST (#13). v2 spells node-data as
  // a `#data` fragment of its parent, and the decomposition below is purely
  // positional — left in place the fragment would ride along into the terminal
  // atom and produce `loc: 'cor:urn#data'`, which is not a loc: no memory
  // contains it, `#` is outside the atom charset, and a caller using it as a
  // lookup key gets a silent miss. The v1 spelling of the same resource
  // (`hrn:data:<root>::<mem>::<loc>`) yields a clean loc, so folding the
  // fragment in would make one resource decompose two different ways.
  let fragment: string | undefined;
  let urn = input;
  const hashIdx = input.indexOf('#');
  if (hashIdx !== -1) {
    fragment = input.slice(hashIdx + 1);
    urn = input.slice(0, hashIdx);
    // Validate the fragment against the SAME rules `parseUrnV2` enforces, before
    // stripping it. Otherwise these decomposers — which are self-validating by
    // contract — would be more permissive than `parseUrn` for the same input,
    // silently accepting `#bogus` (not a registered fragment word) or a fragment
    // on an edge (only node/apprun may parent one) and handing back a clean loc.
    if (!V2_FRAGMENTS.has(fragment) || !FRAGMENT_PARENT_TYPES.has(expectedType)) {
      throw new UrnNotQualifiedError(input, undefined, expectedType);
    }
  }

  assertFullyQualifiedUrn(urn, expectedType);

  const prefixMatch = urn.match(QUAL_PREFIX_STRIP_RE);
  const path = prefixMatch ? prefixMatch[1]! : urn;

  // v1 hierarchy (`::`) vs flat v2 (single `:`) — and the two grammars put the
  // memory/loc boundary in DIFFERENT places, so they can't share one rule:
  //
  //   v1: the TERMINAL `::` segment is the opaque loc and everything before it
  //       is the memory path, which may be multi-segment
  //       (`<org>::<app>::<agent>::<role>::<loc>` — see the parser, where only
  //       the final segment is unbounded). Slicing a fixed two segments here
  //       silently moved most of a multi-segment memory into the loc.
  //   v2: `hrn:<type>:<root>:<mem>:<loc...>` — the memory is exactly ONE atom
  //       after the root, and everything past it is the loc.
  //
  // Both still normalize to the same `loc` for the common 3-part case, which is
  // the whole point of preferring these over `pathSegments`.
  const isV1 = path.includes('::');
  const parts = isV1 ? path.split('::') : path.split(':');
  const out: NodeLikeUrnParts = isV1
    ? {
        memoryUrn: parts.slice(0, -1).join(':'),
        loc: parts[parts.length - 1]!,
      }
    : {
        memoryUrn: `${parts[0]!}:${parts[1]!}`,
        loc: parts.slice(2).join(':'),
      };
  if (fragment !== undefined) out.fragment = fragment;
  return out;
}

/**
 * Split a fully-qualified node URN into its memory URN and the loc within that
 * memory. Self-validating (calls `assertFullyQualifiedUrn(input, 'node')`).
 * The returned `memoryUrn` is the bare `<org>:<memorySlug>` form; a `#data`
 * fragment is reported separately rather than folded into `loc` (#13).
 */
export function splitNodeUrn(input: string): NodeLikeUrnParts {
  return splitNodeLikeUrn(input, 'node');
}

/**
 * Split a fully-qualified edge URN into its memory URN and the loc within that
 * memory (#12). Same shape as `splitNodeUrn` — the edge loc is an OPAQUE
 * terminal and is never re-split into `source:target`.
 */
export function splitEdgeUrn(input: string): NodeLikeUrnParts {
  return splitNodeLikeUrn(input, 'edge');
}
