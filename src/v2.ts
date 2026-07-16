// Grammar v2 — the FLAT, pool-rooted forms (hadron-server#694, decision
// D-2026-07-15-001). ADDITIVE and coexisting with the v1 surface: v1 parse/
// compose stay for the transition, and hadron-server keeps EMITTING v1 until
// the online migration (#697) flips it. This module gives strict v2 parse/
// compose so v2 can be built and tested now.
//
// v2 shape:   hrn:<type>:<root>[:<segment>...]     (single colon, NO sigil)
//   root     = ONE atom — the owner principal (org domain OR user handle) from
//              the unified per-server pool. No `@` sigil, no `user:`/`org:`
//              marker (the pool makes the root unambiguous by itself).
//   segments = the remaining flat atoms (container slug(s) + name/loc), per type.
//
// Out of scope here (own issues): per-entity arity/container semantics (#696),
// legacy chain->flat normalization + the stored alias map (#697), and the
// unified-pool enforcement in the data model (#692).

import { UrnParseError } from './errors.js';
import { CANONICAL_SCHEME } from './scheme.js';
import { validateAtomShape } from './slug.js';

/**
 * The v2 type registry (SEEDED here; finalized in the spec rewrite, #698).
 * Note the renames vs v1 (`memory` → `mem`) and the additions (`apprun`,
 * `noderev`, `appkey`, …). `data` is demoted to a `#fragment` and is NOT a type.
 */
export const V2_URN_TYPES = [
  'org', 'user', 'mem', 'agent', 'app', 'node', 'edge', 'asset', 'secret',
  'apprun', 'noderev', 'appkey', 'aiconf', 'tool', 'server', 'userapikey',
  'agentschedule', 'agentwebhook', 'license', 'subscription', 'usage',
  'reference', 'session', 'platform',
] as const;

export type V2UrnType = (typeof V2_URN_TYPES)[number];

const V2_TYPE_SET: ReadonlySet<string> = new Set<string>(V2_URN_TYPES);

export interface ParsedUrnV2 {
  /** Always canonical `hrn` after parse (a legacy `urn:` scheme is normalized). */
  scheme: 'hrn';
  type: string;
  /** The owner root atom (org domain or user handle). */
  root: string;
  /** The flat atoms after the root (container slug(s) + name/loc), in order. */
  segments: string[];
}

const V2_PREFIX_RE = /^(hrn|urn):([a-z][a-z0-9-]*):(.+)$/;

/**
 * Parse a STRICT grammar-v2 flat URN. Rejects the v1 constructs — the `::`
 * hierarchy separator and the `@`/`user:` root sigil — which continue to go
 * through the v1 `parseUrn` during the transition. Throws `UrnParseError`.
 */
export function parseUrnV2(input: string): ParsedUrnV2 {
  const m = input.match(V2_PREFIX_RE);
  if (!m) throw new UrnParseError(input, 'malformed-grammar');
  const type = m[2]!;
  const rest = m[3]!;
  if (!V2_TYPE_SET.has(type)) throw new UrnParseError(input, 'unknown-type');
  // v2 is single-colon; a `::` means a v1 hierarchy form.
  if (rest.includes('::')) throw new UrnParseError(input, 'malformed-grammar');
  const atoms = rest.split(':');
  // Every atom must be charset-valid — this also rejects the `@` sigil (not in
  // the atom charset) and any empty atom (leading/trailing/doubled colon).
  for (const atom of atoms) validateAtomShape(input, atom);
  const [root, ...segments] = atoms;
  return { scheme: 'hrn', type, root: root!, segments };
}

/**
 * Compose a canonical grammar-v2 flat URN from a type, root, and flat segments.
 * Validates the type against the v2 registry and every atom's charset. A
 * multi-atom loc must be passed as its individual atoms.
 */
export function composeUrnV2(type: string, root: string, ...segments: string[]): string {
  if (!V2_TYPE_SET.has(type)) throw new UrnParseError(type, 'unknown-type', type);
  validateAtomShape(root, root);
  for (const s of segments) validateAtomShape(s, s);
  return `${CANONICAL_SCHEME}:${type}:${[root, ...segments].join(':')}`;
}

/** True when `input` is already a canonical grammar-v2 flat URN (round-trips). */
export function isFlatV2(input: string): boolean {
  try {
    const p = parseUrnV2(input);
    return `${CANONICAL_SCHEME}:${p.type}:${[p.root, ...p.segments].join(':')}` === input;
  } catch {
    return false;
  }
}
