// API-boundary URN qualification (spec 022). Ported verbatim from hadron-server
// src/lib/urn.ts. assertFullyQualifiedUrn / splitNodeUrn throw
// UrnNotQualifiedError (distinct from UrnParseError) — the boundary gate.

import { UrnParseError } from './errors.js';
import { hasSchemePrefix } from './scheme.js';

export type ExpectedUrnType = 'org' | 'memory' | 'agent' | 'app' | 'node' | 'edge' | 'user';

const MIN_HIERARCHY_SEGMENTS: Record<ExpectedUrnType, number> = {
  org: 1, memory: 2, agent: 2, app: 2, node: 3, edge: 3, user: 1,
};

const MIN_SEGMENTS_HINT: Record<ExpectedUrnType, string> = {
  org: '1 hierarchy segment (e.g., "acme.com")',
  memory: '2 hierarchy segments (org::memory, e.g., "acme.com::mmdata")',
  agent: '2 hierarchy segments (org::agent-slug, e.g., "acme.com::coding-agent")',
  app: '2 hierarchy segments (org::app-slug, e.g., "acme.com::dev-app")',
  node: '3 hierarchy segments (org::memory::loc, e.g., "acme.com::mmdata::review:sort-imports")',
  edge: '3 hierarchy segments (org::memory::loc, e.g., "acme.com::mmdata::intro:next")',
  user: '1 hierarchy segment (the handle, e.g., "holger")',
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
    if (!isNodeRoleAlias) {
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
 * Split a fully-qualified node URN into its memory URN and the loc within that
 * memory. Self-validating (calls `assertFullyQualifiedUrn(input, 'node')`).
 * The returned `memoryUrn` is the bare `<org>:<memorySlug>` form.
 */
export function splitNodeUrn(input: string): { memoryUrn: string; loc: string } {
  assertFullyQualifiedUrn(input, 'node');

  const prefixMatch = input.match(QUAL_PREFIX_STRIP_RE);
  const path = prefixMatch ? prefixMatch[1]! : input;

  if (path.includes('::')) {
    const segments = path.split('::');
    return { memoryUrn: `${segments[0]!}:${segments[1]!}`, loc: segments.slice(2).join(':') };
  }
  const atoms = path.split(':');
  return { memoryUrn: `${atoms[0]!}:${atoms[1]!}`, loc: atoms.slice(2).join(':') };
}
