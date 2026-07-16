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
- **slug** — `validateAtomShape`, `validateUserSlug`, `validateOrgSlug`, `deriveSlugFromName`
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

Typed helpers: `composeSecretUrnV2`, `composeAppRunUrnV2`, `composeNodeRevUrnV2`,
`composeDataFragmentV2`, and `parseNodeRevUrnV2`.

Not yet ported (later increments, gated by the same corpus): legacy chain→flat
**normalization** + the stored alias map (hadron-server#697) and the unified
principal-**pool** enforcement (hadron-server#692).

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

```bash
npm install
npm test          # runs the corpus
npm run build
```

## License

MIT © Baragaun, Inc.
