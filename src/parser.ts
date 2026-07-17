// Canonical-form URN parser (spec 021). Ported verbatim from hadron-server
// src/lib/urn.ts. Throws UrnParseError on any acceptance-rule violation.

import { UrnParseError } from './errors.js';
import { CANONICAL_SCHEME, LEGACY_SCHEME } from './scheme.js';
import {
  URN_TYPE_SET, NODE_URN_TYPES, TYPE_MARKERS, ROLE_MARKERS, RESERVED_SLUGS,
  type CanonicalUrnType, type AliasCategory,
} from './registry.js';
import { validateAtomShape } from './slug.js';
import { parseUrnV2 } from './v2.js';

export interface ParsedUrn {
  type: CanonicalUrnType;
  pathSegments: string[];
  parserCanonical: string;
  inputForm: string;
  parserRewrites: AliasCategory[];
  needsResolverCanonicalization: boolean;
}

/**
 * URN types whose owner/author namespace may be a user handle written
 * `@<handle>` (spec 047) — every type whose first path-segment is an owner org.
 * Excludes `org`/`user` (their position-0 segment is the entity's own slug).
 */
const OWNER_NAMESPACED_TYPES: ReadonlySet<string> = new Set<string>([
  // `secret` (#679): its owner ROOT may be a user `@<handle>` like the others.
  'app', 'agent', 'memory', 'edge', 'secret', ...NODE_URN_TYPES,
]);

/**
 * Secret (#679): normalize a `user:<handle>` owner-root to the canonical
 * `@<handle>` form (both spellings are valid + equivalent; `@<handle>` is
 * canonical). Applies to the ROOT (position 0) of a secret URN only.
 */
function rewriteSecretUserRoot(segments: string[]): string[] {
  if (segments.length === 0) return segments;
  const m = /^user:([A-Za-z0-9._-]+)$/.exec(segments[0]!);
  return m ? [`@${m[1]}`, ...segments.slice(1)] : segments;
}

/**
 * Secret (#679) shape check at parse time. A secret URN is
 * `<root>::[<app|memory>:<slug>::]<name>` — at most 3 hierarchy segments, and
 * when the middle owner segment is present it MUST be exactly `app:<slug>` or
 * `memory:<slug>`. Rejecting a bad marker here keeps parseUrn consistent with
 * the resolution parser instead of parse-OK-then-resolve-fail.
 */
function validateSecretSegments(input: string, segments: string[]): void {
  if (segments.length > 3) {
    throw new UrnParseError(input, 'invalid-segment-shape', segments[3]);
  }
  if (segments.length === 3) {
    const atoms = segments[1]!.split(':');
    if (atoms.length !== 2 || (atoms[0] !== 'app' && atoms[0] !== 'memory')) {
      throw new UrnParseError(input, 'invalid-segment-shape', segments[1]);
    }
  }
}

/** Parse-time per-segment charset/length validation + the spec-047 `@handle` gate. */
function validatePathSegment(
  input: string,
  segment: string,
  type: string,
  index: number,
  totalSegments: number,
): void {
  const atoms = segment.split(':');
  const ownerNamespaced = OWNER_NAMESPACED_TYPES.has(type);

  let authorContextHere = false;
  if (index >= 1) {
    if (type === 'agent') authorContextHere = index <= totalSegments - 1;
    else if (type === 'memory') authorContextHere = index <= totalSegments - 2;
    else if (NODE_URN_TYPES.has(type) || type === 'edge')
      authorContextHere = index <= totalSegments - 3;
  }

  const markerPrefixed = index >= 1 && atoms.length >= 2 && TYPE_MARKERS.has(atoms[0]!);
  const handleIdx = markerPrefixed ? 1 : 0;

  for (let j = 0; j < atoms.length; j++) {
    let atom = atoms[j]!;
    const isOwnerHandleAtom =
      ownerNamespaced &&
      j === handleIdx &&
      atom.startsWith('@') &&
      (index === 0 || (authorContextHere && atoms.length >= handleIdx + 2));
    if (isOwnerHandleAtom) {
      atom = atom.slice(1);
      if (atom.length === 0) {
        throw new UrnParseError(input, 'invalid-segment-shape', segment);
      }
    }
    validateAtomShape(input, atom);
  }
}

/** Enforce FR-020 internal-`:` shape rules per path-segment position. */
function rejectInvalidSegmentShapes(input: string, type: string, segments: string[]): void {
  const finalIdx = segments.length - 1;
  const isNodeUrn = NODE_URN_TYPES.has(type);
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]!;
    const atomCount = segment.split(':').length;
    if (i === 0) {
      if (atomCount !== 1) throw new UrnParseError(input, 'invalid-segment-shape', segment);
      continue;
    }
    if (isNodeUrn && i === finalIdx) continue; // leaf node loc: unbounded
    if (atomCount > 3) throw new UrnParseError(input, 'invalid-segment-shape', segment);
  }
}

/** Position-aware reserved-word rejection during parsing. */
function rejectReservedWordsAtIllegalPositions(input: string, type: string, segments: string[]): void {
  // Secret (#679): its positions (`<root>::[<app|memory>:<slug>::]<name>`) don't
  // follow the node/memory role-marker rules; enforce its own shape here (it
  // skips cat-4 stripping, so a bad marker would otherwise only fail at resolution).
  if (type === 'secret') {
    validateSecretSegments(input, segments);
    return;
  }
  const finalIdx = segments.length - 1;
  let roleMarkerIdx: number | null;
  let minSegments: number;
  if (type === 'memory') {
    roleMarkerIdx = finalIdx;
    minSegments = 3;
  } else if (NODE_URN_TYPES.has(type)) {
    roleMarkerIdx = finalIdx - 1;
    minSegments = 4;
  } else {
    roleMarkerIdx = null;
    minSegments = 0;
  }

  const leafIsNodeLoc = NODE_URN_TYPES.has(type);
  for (let i = 0; i < segments.length; i++) {
    if (leafIsNodeLoc && i === finalIdx) continue;
    const atoms = segments[i]!.split(':');
    for (let j = 0; j < atoms.length; j++) {
      const atom = atoms[j]!;
      const lower = atom.toLowerCase();
      if (!RESERVED_SLUGS.has(lower)) continue;
      const isRoleMarkerPosition =
        roleMarkerIdx !== null &&
        i === roleMarkerIdx &&
        j === 0 &&
        segments.length >= minSegments &&
        (ROLE_MARKERS as readonly string[]).includes(lower);
      if (isRoleMarkerPosition) continue;
      throw new UrnParseError(input, 'reserved-word-slug', atom);
    }
  }
}

/** Cat 4 — strip optional type markers (`app:`/`agent:`/`memory:`) per segment. */
function stripTypeMarkers(segments: string[], urnType: string): { segments: string[]; fired: boolean } {
  // Secret (#679): the `app:`/`memory:` marker on a secret's owner segment is
  // STRUCTURAL (distinguishes app-owned from memory-owned) — never strip it.
  if (urnType === 'secret') return { segments, fired: false };
  let fired = false;
  const isNodeUrn = NODE_URN_TYPES.has(urnType);
  const lastIdx = segments.length - 1;
  const out = segments.map((segment, i) => {
    if (i === 0) return segment;
    if (isNodeUrn && i === lastIdx) return segment;
    const atoms = segment.split(':');
    if (atoms.length >= 2 && TYPE_MARKERS.has(atoms[0]!)) {
      fired = true;
      return atoms.slice(1).join(':');
    }
    return segment;
  });
  return { segments: out, fired };
}

/** Cat 1 — collapse install-by-self URN to definition URN when installing org == author org. */
function collapseSelfInstall(type: CanonicalUrnType, segments: string[]): { segments: string[]; fired: boolean } {
  if ((type !== 'memory' && type !== 'agent') || segments.length < 2) {
    return { segments, fired: false };
  }
  const orgSeg = segments[0]!;
  const lastScanIdx = type === 'memory' ? segments.length - 2 : segments.length - 1;
  for (let i = 1; i <= lastScanIdx; i++) {
    const atoms = segments[i]!.split(':');
    if (atoms.length !== 2) continue;
    if (atoms[0] !== orgSeg) continue;
    const collapsed = [...segments.slice(0, i), atoms[1]!, ...segments.slice(i + 1)];
    return { segments: collapsed, fired: true };
  }
  return { segments, fired: false };
}

/** Cat 2 — node-role polymorphism: node URNs always need a resolver check. */
function needsCat2(type: CanonicalUrnType, _segments: string[]): boolean {
  return type === 'node';
}

/** Cat 3 — path/slug shortening: single-atom install slot on a 3+-segment agent URN. */
function needsCat3(type: CanonicalUrnType, segments: string[]): boolean {
  if (type !== 'agent') return false;
  if (segments.length < 3) return false;
  const installSlot = segments[segments.length - 1]!;
  return installSlot.split(':').length === 1;
}

const LOC_PREFIX_RE = /^((urn|hrn):)?loc:/i;
const PREFIX_RE = /^(hrn|urn):([a-z][a-z0-9-]*):(.+)$/;
const EMBEDDED_LOC_RE = /(^|::)loc:/;

/**
 * grammar-v2 flat type words that have a v1 canonical equivalent, mapped to it.
 * A v2-emitted URN of one of these types is delegated to `parseUrnV2` and mapped
 * into the `ParsedUrn` shape (`mem` → `memory`, #697 emission flip). v2-ONLY
 * types (`apprun`, `noderev`, `appkey`, …) are absent on purpose — they never
 * existed in the v1 parser surface, so a `hrn:apprun:…` input keeps its v1
 * `unknown-type` error rather than silently gaining a partial parse here.
 */
const V2_TO_V1_TYPE: Readonly<Record<string, CanonicalUrnType>> = {
  mem: 'memory', org: 'org', user: 'user', agent: 'agent', app: 'app',
  node: 'node', edge: 'edge', asset: 'asset', secret: 'secret',
};

/**
 * Delegate a v1-rejected input to the grammar-v2 flat parser (#697). Returns a
 * `ParsedUrn` when `input` is a flat-v2 URN of a type with a v1 equivalent,
 * else `null` (so `parseUrn` rethrows the original v1 error). The `.type` field
 * is the mapped v1 word (for consumer `switch (type)` dispatch) while
 * `.parserCanonical` keeps the actual v2 type word so the canonical string is a
 * valid, round-tripping v2 URN. v2 is already flat/pool-rooted, so no D11
 * resolver canonicalization applies.
 */
function tryParseFlatV2(input: string): ParsedUrn | null {
  let parsed;
  try {
    parsed = parseUrnV2(input);
  } catch {
    return null;
  }
  const mappedType = V2_TO_V1_TYPE[parsed.type];
  if (!mappedType) return null;
  const parserRewrites: AliasCategory[] = [];
  if (input.startsWith(`${LEGACY_SCHEME}:`)) parserRewrites.push('legacy-urn-scheme');
  const frag = parsed.fragment !== undefined ? `#${parsed.fragment}` : '';
  const pathSegments = [parsed.root, ...parsed.segments];
  return {
    type: mappedType,
    pathSegments,
    parserCanonical: `${CANONICAL_SCHEME}:${parsed.type}:${pathSegments.join(':')}${frag}`,
    inputForm: input,
    parserRewrites,
    needsResolverCanonicalization: false,
  };
}

/**
 * Parse a URN string. Returns a `ParsedUrn` with parser-layer canonicalization
 * (D11 cats 1, 4) applied. Throws `UrnParseError` on any acceptance violation.
 * Slug storage is case-sensitive; only the reserved-word check folds case.
 *
 * The v1 grammar is tried first; a v1-rejected input that is a valid flat
 * grammar-v2 URN (single-colon, pool-rooted, `mem` type word — #697) is
 * delegated to `parseUrnV2` and mapped into the `ParsedUrn` shape. v1-accepted
 * inputs keep their exact v1 result, so no existing behavior changes.
 */
export function parseUrn(input: string): ParsedUrn {
  try {
    return parseUrnV1(input);
  } catch (err) {
    if (err instanceof UrnParseError) {
      const v2 = tryParseFlatV2(input);
      if (v2) return v2;
    }
    throw err;
  }
}

/** The v1-grammar parser (spec 021). See `parseUrn` for the v2 delegation wrapper. */
function parseUrnV1(input: string): ParsedUrn {
  if (LOC_PREFIX_RE.test(input)) {
    throw new UrnParseError(input, 'loc-segment-rejected');
  }
  const prefixMatch = input.match(PREFIX_RE);
  if (!prefixMatch) {
    throw new UrnParseError(input, 'malformed-grammar');
  }
  const legacySchemeUsed = prefixMatch[1] === LEGACY_SCHEME;
  const type = prefixMatch[2]!;
  if (!URN_TYPE_SET.has(type)) {
    throw new UrnParseError(input, 'unknown-type');
  }
  const path = prefixMatch[3]!;
  if (EMBEDDED_LOC_RE.test(path)) {
    throw new UrnParseError(input, 'loc-segment-rejected');
  }
  if (path.endsWith('::')) {
    throw new UrnParseError(input, 'trailing-double-colon');
  }
  const rawSegments = path.split('::');
  if (rawSegments.some((s) => s.length === 0)) {
    throw new UrnParseError(input, 'empty-segment');
  }

  // Secret (#679): a user owner-root may be written `user:<handle>`; normalize
  // it to canonical `@<handle>` at ROOT position 0 before the shape checks.
  const workSegments = type === 'secret' ? rewriteSecretUserRoot(rawSegments) : rawSegments;

  for (let i = 0; i < workSegments.length; i++) {
    validatePathSegment(input, workSegments[i]!, type, i, workSegments.length);
  }

  const parserRewrites: AliasCategory[] = [];
  if (legacySchemeUsed) parserRewrites.push('legacy-urn-scheme');

  const { segments: cat4Segments, fired: cat4Fired } = stripTypeMarkers(workSegments, type);
  if (cat4Fired) parserRewrites.push('type-marker-optionality');

  rejectInvalidSegmentShapes(input, type, cat4Segments);
  rejectReservedWordsAtIllegalPositions(input, type, cat4Segments);

  const { segments: cat1Segments, fired: cat1Fired } = collapseSelfInstall(
    type as CanonicalUrnType,
    cat4Segments,
  );
  if (cat1Fired) parserRewrites.push('source-install-memory');

  const needsResolverCanonicalization =
    needsCat2(type as CanonicalUrnType, cat1Segments) ||
    needsCat3(type as CanonicalUrnType, cat1Segments);

  const parserCanonical = `${CANONICAL_SCHEME}:${type}:${cat1Segments.join('::')}`;

  return {
    type: type as CanonicalUrnType,
    pathSegments: cat1Segments,
    parserCanonical,
    inputForm: input,
    parserRewrites,
    needsResolverCanonicalization,
  };
}

/** True if `parseUrn(input).parserCanonical === input` with no rewrites. */
export function isParserCanonical(input: string): boolean {
  try {
    const parsed = parseUrn(input);
    return parsed.parserCanonical === input && parsed.parserRewrites.length === 0;
  } catch {
    return false;
  }
}

/** Parse and return the parser-layer canonical form (cats 1, 4). Throws on failure. */
export function toParserCanonical(input: string): string {
  return parseUrn(input).parserCanonical;
}
