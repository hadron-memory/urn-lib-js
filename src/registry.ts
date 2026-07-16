// The type registry (locked). Ported from hadron-server src/lib/urn.ts.
// NOTE: this is the v1-parity registry. The grammar-v2 changes (add `apprun`,
// demote `data` to a fragment, etc. — hadron-server#694/#696) land in a later
// increment behind the same fixture corpus.

/** Core URN types. */
export const CORE_TYPES = [
  'agent', 'app', 'app-user', 'ai-config', 'asset', 'edge',
  'license', 'memory', 'node', 'org', 'platform', 'reference',
  'secret', 'session', 'subscription', 'usage', 'user',
] as const;

/** Node types. */
export const NODE_TYPES = [
  'abstract', 'partial', 'parent', 'plan', 'prompt', 'record', 'task', 'review',
] as const;

/** Node roles (also valid as `hrn:<role>:...`). */
export const NODE_ROLES = [
  'chat', 'chat-message', 'config', 'conversation', 'event', 'goal', 'stage',
] as const;

/** Node parts. */
export const NODE_PARTS = ['condition', 'data'] as const;

/** All URN types recognized after the scheme prefix. */
export const URN_TYPES = [
  ...CORE_TYPES, ...NODE_TYPES, ...NODE_ROLES, ...NODE_PARTS,
] as const;

export const URN_TYPE_SET: ReadonlySet<string> = new Set<string>(URN_TYPES);

/** The full type registry. */
export type CanonicalUrnType = (typeof URN_TYPES)[number];

/** Memory-role markers (slug-validation reserves their prefixes). */
export const ROLE_MARKERS = ['system', 'app-mem', 'app-user', 'group-mem', 'priv', 'anon'] as const;

/** Single source of truth for memory-role markers on the resolver layer. */
export const MEMORY_ROLE_MARKERS: readonly string[] = ROLE_MARKERS;

/** Type-marker words that may appear inside path-segments (D2 / FR-005). */
export const TYPE_MARKERS: ReadonlySet<string> = new Set(['app', 'agent', 'memory']);

/** URN types that identify a node (vs a memory / agent / app / org / etc.). */
export const NODE_URN_TYPES: ReadonlySet<string> = new Set<string>([
  'node', ...NODE_TYPES, ...NODE_ROLES, ...NODE_PARTS,
]);

/**
 * Slug-reserved-word list (FR-019) — a SUPERSET of the type registry: the type
 * words, `loc` (deprecated as a type but reserved as a slug), and the
 * role-marker prefixes. Case-insensitive: stored lowercased, compared lowercased.
 */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set<string>(
  [...URN_TYPES, 'loc', ...ROLE_MARKERS].map((w) => w.toLowerCase()),
);

/** Alias categories tracked in a parsed URN's rewrite list. */
export type AliasCategory =
  | 'source-install-memory'
  | 'node-role-polymorphism'
  | 'path-slug-shortening'
  | 'type-marker-optionality'
  | 'legacy-urn-scheme';
