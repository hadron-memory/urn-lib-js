# @hadron-memory/urn-lib-js

Hadron URN compose / parse / normalize for JavaScript & TypeScript.

Paired with [`urn-lib-go`](https://github.com/hadron-memory/urn-lib-go). Both
implementations run the **same conformance corpus** (`fixtures/corpus.json`) —
the corpus is the contract, so the two languages cannot drift. This exists to
replace the copy-pasted URN parsers that had already drifted across
hadron-server / portal / docs / cli (hadron-server#239, #693).

## Status

**Increment 1 — v1-parity core.** This release ports the pure, self-contained
slice of `hadron-server/src/lib/urn.ts` verbatim, behind the shared corpus:

- **scheme** — `CANONICAL_SCHEME`, `LEGACY_SCHEME`, `hasSchemePrefix`, `normalizeScheme`
- **registry** — the locked type registry (`URN_TYPES`, `ROLE_MARKERS`, `RESERVED_SLUGS`, …)
- **normalize** — `normalizeUrnForLookup`, `legacyMemoryUrnToCanonical`, `agentSlugFromUrn`
- **slug** — `validateAtomShape`, `validateUserSlug`, `validateOrgSlug` (requires a dotted root, #692), `validateUserHandle` (dot-free, #692), `deriveSlugFromName`
- **legacy** — `parseUrnInput`, `formatUrn`, `validateUrnType` (the pre-021 surface)
- **parser** — `parseUrn` (the canonical-form parser, D11 cats 1 + 4), `isParserCanonical`, `toParserCanonical`
- **compose** — `formatCanonicalUrn`, `composeNodeUrn`, `composeEdgeUrn`
- **display** — `parseDisplayUrn`, `DISPLAY_URN_TYPES` (the tolerant spec-010 chip parser/registry — separate from the strict canonical parser; falls back to `unknown` for unregistered display kinds)
- **errors** — `UrnParseError` + the machine-stable `UrnParseErrorReason` union

**Grammar-v2 flat forms** (hadron-server#694) are ported: `parseUrnV2` /
`composeUrnV2` / `isFlatV2` over `hrn:<type>:<root>[:<segment>...]` (single
colon, no sigil), additive to the v1 surface.

**Per-entity v2 shapes** (hadron-server#696, decision D-2026-07-15-006) are
ported too:

- **secret** — `hrn:secret:<root>:<name>`, org/user root + exactly one name atom
  (the v1 `app:`/`memory:` markers have no v2 equivalent and are rejected).
- **apprun** — `hrn:apprun:<root>:<app>:<run-id>` (fixed arity).
- **noderev** — `hrn:noderev:<root>:<mem>:<loc...>:<rev>`, **end-anchored** (last
  atom is the revision id); decompose with `parseNodeRevUrnV2`.
- **node / edge** — `hrn:<type>:<root>:<mem>:<loc...>` (a memory + at least one
  loc atom); the loc is an **opaque terminal** (an edge loc is never re-split
  into `source:target`).
- **`#data` fragment** — `<node-or-apprun-urn>#data` (node-data is a fragment of
  its parent, not a standalone type). `composeDataFragmentV2` always emits a
  canonical `hrn:` URN, even from a legacy `urn:`-scheme parent.

`#696` demoted the v1 node-**part** type words (`data`, `condition`) to
fragments. That changed the spelling, not the meaning — so `parseUrn` maps a
fragmented flat-v2 URN onto the fragment's v1 type word:
`hrn:node:<root>:<mem>:<loc>#data` parses as `type: 'data'` over the parent's
path, which is exactly the v1 `hrn:data:<root>::<mem>::<loc>` reading of the
same resource. `parserCanonical` keeps the v2 form (fragment included), so it
round-trips. A fragment on a v2-**only** parent (`apprun`, `worker`) has no v1
type equivalent and keeps its `unknown-type` error; reach for `parseUrnV2` when
you need the parent type and fragment as separate fields.

Typed helpers: `composeSecretUrnV2`, `composeAppRunUrnV2`, `composeNodeRevUrnV2`,
`composeDataFragmentV2`, and `parseNodeRevUrnV2`.

Not yet ported (later increments, gated by the same corpus): legacy chain→flat
**normalization** + the stored alias map (hadron-server#697) and the unified
principal-**pool** enforcement (hadron-server#692).

## Getting a loc: use the decomposers, not `pathSegments`

`ParsedUrn.pathSegments` is a **raw split whose shape follows the input's
grammar** (#12). v1 input is split on `::`, so a segment may carry an internal
`:`; flat-v2 input is split on the single `:`, so every atom is its own element.
The two spellings of one resource therefore differ:

```ts
parseUrn('hrn:node:acme.com::specs::cor:urn').pathSegments  // ['acme.com', 'specs', 'cor:urn']
parseUrn('hrn:node:acme.com:specs:cor:urn').pathSegments    // ['acme.com', 'specs', 'cor', 'urn']
```

This affects every type whose v1 form permits an internal `:` inside a segment —
`memory` (valued role markers like `app-user:<id>`), `node`, and `edge`. `org`,
`user`, `agent`, `app`, `secret` and `asset` are identical under both grammars.

`splitNodeUrn` / `splitEdgeUrn` normalize across grammars and report a `#data`
fragment separately, so a caller never has to know which grammar it was handed:

```ts
splitNodeUrn('hrn:node:acme.com::specs::cor:urn');       // { memoryUrn: 'acme.com:specs', loc: 'cor:urn' }
splitNodeUrn('hrn:node:acme.com:specs:cor:urn');         // { memoryUrn: 'acme.com:specs', loc: 'cor:urn' }
splitNodeUrn('hrn:node:acme.com:specs:cor:urn#data');    // { …, loc: 'cor:urn', fragment: 'data' }
```

An edge loc is an **opaque terminal** — `splitEdgeUrn` never re-splits it into
`source:target`. Use `parseUrnV2` when you want the v2 root / segments /
fragment as separate fields.

Both return `NodeLikeUrnParts` (node and edge share one shape). Under v1 the
memory may be **multi-segment**, and the terminal `::` segment is the loc:

```ts
splitNodeUrn('hrn:node:mm.org::coding-app::coding-agent::app-mem::a:b');
// { memoryUrn: 'mm.org:coding-app:coding-agent:app-mem', loc: 'a:b' }
```

Both are **self-validating**: they reject an unregistered fragment word and a
fragment on an edge (only `node`/`apprun` may parent one), so they are never
more permissive than `parseUrn` for the same input.

**Known gap:** there is no `splitMemoryUrn` yet. v2 leaves `mem` arity
unconstrained, so `hrn:mem:<root>:<a>:<b>:<c>` cannot be split into containers
vs leaf until the v2 spec pins it (hadron-server#698).

## Usage

```ts
import { normalizeUrnForLookup, validateOrgSlug, UrnParseError } from '@hadron-memory/urn-lib-js';

normalizeUrnForLookup('acme.com::specs::cor:urn'); // 'acme.com:specs:cor:urn'

try {
  validateOrgSlug('Acme.com');
} catch (e) {
  if (e instanceof UrnParseError) console.log(e.reason); // 'slug-not-lowercase'
}
```

## The conformance corpus

`fixtures/corpus.json` is the source of truth for behavior. Each case is
`{ fn, in: [args], out?, throws? }` — `out` is the expected return, `throws` is
the expected `UrnParseError.reason`, and neither means a `void` call that must
not throw. `test/corpus.test.ts` runs every case against this implementation;
`urn-lib-go` runs the identical file. **Add behavior by adding a corpus case,
not by editing a test in one language.**

**npm is the package manager of record.** `package-lock.json` is the only
lockfile in the tree — don't add a second one.

```bash
npm install
npm test          # runs the corpus
npm run build
```

## License

MIT © Baragaun, Inc.
