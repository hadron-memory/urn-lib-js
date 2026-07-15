# URN conformance corpus

`corpus.json` is the **language-agnostic contract** for every `urn-lib`
implementation. It is the canonical copy; `urn-lib-go` vendors a synced copy.

## Case shape

```json
{ "fn": "validateOrgSlug", "in": ["Acme.com"], "throws": "slug-not-lowercase" }
```

- `fn` — the function under test (dispatched by name in each language's runner).
- `in` — the argument list, spread into the call.
- `out` — the expected return value (deep-equal). Present for value-returning functions.
- `throws` — the expected `UrnParseError.reason`. Present for cases that must reject.
- Neither `out` nor `throws` — a `void` function (e.g. `validate*`) that must **not** throw.

## Rules

1. **The corpus is the contract.** Add or change behavior here; every language
   implementation then conforms. Never encode an expectation in one language's
   test that isn't in the corpus.
2. **`throws` reason codes are stable.** They are part of the contract; human
   message text is not.
3. **Grammar versions coexist.** v1-parity cases live here now; grammar-v2 flat
   forms are added as their own cases (with a `grammar` tag) in a later increment.
4. **Keep it in sync.** Until a shared `urn-lib-fixtures` package exists, the Go
   repo carries a copy — update both in the same change.
