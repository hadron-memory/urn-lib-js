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

- **secret** — two shapes, and the arity decides which: `hrn:secret:<root>:<name>`
  (org/user root + exactly one name atom) and the App secret
  `hrn:secret:<root>:app:<app-slug>:<name>` (the literal lowercase `app` marker,
  then the App's slug and the secret's name; urn-lib-js#40). `hrn:secret:<root>:app`
  is still the flat secret named `app`. Two parts, four or more parts, and any other
  marker (`APP`, `memory`, `org`, `agent`, `user`) are refused, and the App shape
  never sits under a reserved root (`server`, `platform`). The #679 `::` spelling
  `<root>::<app|memory>:<slug>::<name>` is refused by `parseUrn`, never normalized.
  Build with `composeAppSecretUrnV2`; `parseSecretUrnV2` says whose it is
  (`{ownerKind: 'root', root, name}` or `{ownerKind: 'app', root, appSlug, name}`),
  so consumers never re-derive the arity rule.
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

Typed helpers: `composeSecretUrnV2`, `composeAppSecretUrnV2`, `parseSecretUrnV2`, `composeAppRunUrnV2`, `composeNodeRevUrnV2`,
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

When a fragment is the **only** thing wrong with a URN, `parseUrn` says so with
the `fragment-unsupported` reason rather than leaking the v1 parser's complaint
about the `#` character:

```ts
parseUrn('hrn:node:acme.com:mem:loc#bogus');  // UrnParseError, reason 'fragment-unsupported'
parseUrn('hrn:worker:acme.com:eng:iris#data'); // 'unknown-type' — worker has no v1 form either way
```

The test is whether removing the fragment would make the input parse. If it
wouldn't, the original reason stands, so fixing what the error names always
moves you forward.

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

## Tickers and agent tasks (grammar v2)

`hrn:ticker:<root>:<app-slug>:<ticker-slug>` and
`hrn:agenttask:<root>:<app-slug>:<task-id>` each have exactly two segments after
the root. Use `composeTickerUrnV2` with the ticker's permanent derived slug and
`composeAgentTaskUrnV2` with the task's id. Both parse through `parseUrnV2`,
render their own display badge, and normalize a legacy `urn:` prefix to `hrn:`.
They have no v1 equivalent; `parseUrn` rejects them with `unknown-type`.

Task ids follow the shared URN atom rule (letters/digits, dots, underscores and
hyphens, at most 64 characters). A 32-hex or cuid id is valid in the task-id
leaf; root-name registration restrictions do not apply to that leaf.

## App events (grammar v2)

`hrn:appevent:<root>:<app-slug>:<event-id>` addresses one event in an App's event
stream (cor:urn:010:01). It has exactly two segments after the root, like
`hrn:agenttask`. Use `composeAppEventUrnV2` with the event's id. It parses
through `parseUrnV2`, renders its own display badge, normalizes a legacy `urn:`
prefix to `hrn:`, and refuses a `#data` fragment. It is v2-only: `parseUrn`
rejects it with `unknown-type`. The event id is one URN atom (letters/digits,
dots, underscores and hyphens, at most 64 characters).

## Grants (grammar v2)

`hrn:grant:<root>:<app-slug>:<grant-id>` addresses one grant in an App
(cor:urn:010:01, Grant row; ruling 0255 item 9). It has exactly two segments
after the root, like `hrn:appevent`, with the App slug as the container and the
grant's id as the leaf. Use `composeGrantUrnV2` with the grant's id. It parses
through `parseUrnV2`, renders its own display badge, normalizes a legacy `urn:`
prefix to `hrn:`, and refuses a `#data` fragment. The grant id is one ordinary
URN atom (letters/digits, dots, underscores and hyphens, at most 64
characters); there is no UUID-only rule. No other arity is defined, so an
org-wide grant has no URN here. Today `parseUrn` (v1) rejects `hrn:grant` with
`unknown-type`; that is current behaviour, not a ruled rejection (grant being
greenfield v2-only is still Proposed in cor:urn:010:01).

## Root registration policy

`validateOrgSlug` admits dotted and undotted organization names. Both it and
`validateUserHandle` reject 32-hex/cuid-shaped roots (`root-id-shaped`) and the
reserved root words `hrn`/`urn` (`reserved-word-slug`). New handles remain
dot-free. Bare-name, lowercase, charset and length checks remain in place.

This is create/rename policy. Generic slug validation, URN parsing and
composition remain lenient so existing stored URNs and ID-shaped task leaves
still round-trip. The obsolete `org-root-not-dotted` reason is retired.

## Actions (grammar v2)

`hrn:action:<root>:<agent-slug>:<code>` has exactly two segments after the root:
the Team Agent's slug and the action's code (cor:urn:010:01). Use
`composeActionUrnV2`. It parses through `parseUrnV2`, renders its own display
badge, and normalizes a legacy `urn:` prefix to `hrn:`. It has no v1
equivalent; `parseUrn` rejects it with `unknown-type`. Both segments follow the
shared URN atom rule (letters/digits, dots, underscores and hyphens, at most 64
characters).

## AI service configs (grammar v2)

`hrn:aiconf:<owner-root>:<owner-kind>[:<owner-slug>]:<name>`: the owner kind
(an exact, lowercase first segment) decides the shape (cor:urn:010:01). `org`
takes `org:<name>` (`hrn:aiconf:acme.com:org:default`); `app` and `agent` take
`<kind>:<owner-slug>:<name>` (`hrn:aiconf:acme.com:app:mealplan:default`). Any
other kind is refused as `invalid-segment-shape`, `server` included: a
HadronServer owner has no URN form, so the lib builds nothing for it. Under the
reserved roots `server` and `platform` the config takes exactly one part, the
name (`hrn:aiconf:server:default`); no owner kind follows. A name is one atom
under the ordinary rule, so one ending in `-` or `_` is refused. Build with
`composeUrnV2('aiconf', root, ...parts)`. The lib checks shape only: whether the
kind matches the config's real owner is resolution (hadron-server#3857).

## License

MIT © Baragaun, Inc.
