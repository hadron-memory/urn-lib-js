// Grammar v2 — the FLAT, pool-rooted forms (hadron-server#694, decision
// D-2026-07-15-001). ADDITIVE and coexisting with the v1 surface: v1 parse/
// compose stay for the transition, and hadron-server keeps EMITTING v1 until
// the online migration (#697) flips it. This module gives strict v2 parse/
// compose so v2 can be built and tested now.
//
// v2 shape:   hrn:<type>:<root>[:<segment>...][#<fragment>]   (single colon)
//   root     = ONE atom — the owner principal (org domain OR user handle) from
//              the unified per-server pool. No `@` sigil, no `user:`/`org:`
//              marker (the pool makes the root unambiguous by itself).
//   segments = the remaining flat atoms (container slug(s) + name/loc), per type.
//   fragment = an optional `#<word>` suffix; v2 demotes node-data from a
//              standalone type to a `#data` fragment of its parent (#696).
//
// Per-entity arity/container semantics (#696, decision D-2026-07-15-006):
//   secret   hrn:secret:<root>:<name>                 — org/user root + 1 name atom.
//   apprun   hrn:apprun:<root>:<app>:<run-id>         — fixed 2 segments.
//   noderev  hrn:noderev:<root>:<mem>:<loc...>:<rev>  — END-ANCHORED: last atom is
//            the revision id, the first post-root atom is the memory, everything
//            between is the (variable-length, opaque) node loc.
//   node/edge  hrn:<type>:<root>:<mem>:<loc...>       — the loc is an OPAQUE
//            terminal (never re-split into source:target for an edge).
//   node-data  <node-or-apprun-urn>#data              — `#data` fragment.
//
// Out of scope here (own issues): legacy chain->flat normalization + the stored
// alias map (#697), and the unified-pool enforcement in the data model (#692).

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

/**
 * Fragment words valid on a v2 URN. v1 carried `data` as a standalone URN type;
 * v2 demotes it to a `#data` fragment hanging off its parent node/apprun (#696).
 */
const V2_FRAGMENTS: ReadonlySet<string> = new Set<string>(['data']);

/** The types a `#data` fragment may hang off (its parent). */
const FRAGMENT_PARENT_TYPES: ReadonlySet<string> = new Set<string>(['node', 'apprun']);

export interface ParsedUrnV2 {
  /** Always canonical `hrn` after parse (a legacy `urn:` scheme is normalized). */
  scheme: 'hrn';
  type: string;
  /** The owner root atom (org domain or user handle). */
  root: string;
  /** The flat atoms after the root (container slug(s) + name/loc), in order. */
  segments: string[];
  /** Present only when the URN carried a `#<fragment>` suffix (v2 `#data`). */
  fragment?: string;
}

const V2_PREFIX_RE = /^(hrn|urn):([a-z][a-z0-9-]*):(.+)$/;

/**
 * Per-type flat-segment arity check (#696). `segments` is everything AFTER the
 * root atom. Only the #696 fixed-shape types constrain arity; node/edge/mem/…
 * keep the leaf-unbounded generic form (their loc is an opaque terminal of one
 * or more atoms). Throws `UrnParseError('invalid-segment-shape')` on a mismatch.
 */
function validateV2Arity(input: string, type: string, segments: string[]): void {
  switch (type) {
    case 'secret': // hrn:secret:<root>:<name> — exactly one name atom (org/user root).
      if (segments.length !== 1) throw new UrnParseError(input, 'invalid-segment-shape');
      break;
    case 'apprun': // hrn:apprun:<root>:<app>:<run-id>
      if (segments.length !== 2) throw new UrnParseError(input, 'invalid-segment-shape');
      break;
    case 'noderev': // hrn:noderev:<root>:<mem>:<loc...>:<rev> — mem + >=1 loc atom + rev.
      if (segments.length < 3) throw new UrnParseError(input, 'invalid-segment-shape');
      break;
    default:
      break;
  }
}

/**
 * Parse a STRICT grammar-v2 flat URN. Rejects the v1 constructs — the `::`
 * hierarchy separator and the `@`/`user:` root sigil — which continue to go
 * through the v1 `parseUrn` during the transition. Enforces the #696 per-entity
 * arity and the `#data` fragment rules. Throws `UrnParseError`.
 */
export function parseUrnV2(input: string): ParsedUrnV2 {
  // Split off an optional trailing `#<fragment>` first (v2 node-data, #696).
  let fragment: string | undefined;
  let core = input;
  const hashIdx = input.indexOf('#');
  if (hashIdx !== -1) {
    fragment = input.slice(hashIdx + 1);
    core = input.slice(0, hashIdx);
    if (!V2_FRAGMENTS.has(fragment)) throw new UrnParseError(input, 'invalid-segment-shape', fragment);
  }
  const m = core.match(V2_PREFIX_RE);
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
  validateV2Arity(input, type, segments);
  // A fragment may only hang off its parent type (node / apprun).
  if (fragment !== undefined && !FRAGMENT_PARENT_TYPES.has(type)) {
    throw new UrnParseError(input, 'invalid-segment-shape', `#${fragment}`);
  }
  const parsed: ParsedUrnV2 = { scheme: 'hrn', type, root: root!, segments };
  if (fragment !== undefined) parsed.fragment = fragment;
  return parsed;
}

/**
 * Compose a canonical grammar-v2 flat URN from a type, root, and flat segments.
 * Validates the type against the v2 registry, every atom's charset, and the
 * #696 per-type arity. A multi-atom loc must be passed as its individual atoms.
 */
export function composeUrnV2(type: string, root: string, ...segments: string[]): string {
  if (!V2_TYPE_SET.has(type)) throw new UrnParseError(type, 'unknown-type', type);
  validateAtomShape(root, root);
  for (const s of segments) validateAtomShape(s, s);
  validateV2Arity(`${CANONICAL_SCHEME}:${type}:${root}`, type, segments);
  return `${CANONICAL_SCHEME}:${type}:${[root, ...segments].join(':')}`;
}

/** True when `input` is already a canonical grammar-v2 flat URN (round-trips). */
export function isFlatV2(input: string): boolean {
  try {
    const p = parseUrnV2(input);
    const frag = p.fragment !== undefined ? `#${p.fragment}` : '';
    return `${CANONICAL_SCHEME}:${p.type}:${[p.root, ...p.segments].join(':')}${frag}` === input;
  } catch {
    return false;
  }
}

// ─── Per-entity typed helpers (#696) ────────────────────────────────────────
// Thin, self-documenting wrappers so consumers (hadron-server) never hand-build
// these strings and never re-implement the end-anchored noderev split.

/** Compose `hrn:secret:<root>:<name>` (org/user root + a single name atom). */
export function composeSecretUrnV2(root: string, name: string): string {
  return composeUrnV2('secret', root, name);
}

/** Compose `hrn:apprun:<root>:<app>:<run-id>`. */
export function composeAppRunUrnV2(root: string, app: string, runId: string): string {
  return composeUrnV2('apprun', root, app, runId);
}

/**
 * Compose `hrn:noderev:<root>:<mem>:<loc...>:<rev>`. `loc` may be a multi-atom
 * node loc (colon-joined, e.g. `tasks:run-bg-code-gen`); it is split into its
 * atoms so the terminal `rev` stays end-anchored.
 */
export function composeNodeRevUrnV2(root: string, mem: string, loc: string, rev: string): string {
  const locAtoms = loc.split(':');
  return composeUrnV2('noderev', root, mem, ...locAtoms, rev);
}

/**
 * Append the `#data` fragment to a v2 node or apprun URN (#696 node-data). The
 * parent must be a valid v2 node/apprun URN with no existing fragment.
 */
export function composeDataFragmentV2(parentUrn: string): string {
  const p = parseUrnV2(parentUrn);
  if (!FRAGMENT_PARENT_TYPES.has(p.type) || p.fragment !== undefined) {
    throw new UrnParseError(parentUrn, 'invalid-segment-shape', parentUrn);
  }
  return `${parentUrn}#data`;
}

export interface ParsedNodeRevUrnV2 {
  scheme: 'hrn';
  type: 'noderev';
  root: string;
  /** The memory slug (first atom after root). */
  memory: string;
  /** The opaque, colon-joined node loc (the atoms between memory and rev). */
  loc: string;
  /** The terminal revision-id atom (last atom). */
  rev: string;
}

/**
 * Parse and END-ANCHORED-decompose a `hrn:noderev:…` URN (#696). The LAST atom
 * is the revision id; the FIRST post-root atom is the memory slug; everything
 * between is the variable-length, opaque node loc. Throws `UrnParseError` for a
 * non-noderev or malformed input.
 */
export function parseNodeRevUrnV2(input: string): ParsedNodeRevUrnV2 {
  const p = parseUrnV2(input);
  if (p.type !== 'noderev') throw new UrnParseError(input, 'invalid-segment-shape');
  const memory = p.segments[0]!;
  const rev = p.segments[p.segments.length - 1]!;
  const loc = p.segments.slice(1, -1).join(':');
  return { scheme: 'hrn', type: 'noderev', root: p.root, memory, loc, rev };
}
