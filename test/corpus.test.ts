// Conformance test: runs the shared fixture corpus against this implementation.
// The corpus (fixtures/corpus.json) is the cross-language CONTRACT — urn-lib-go
// runs the identical file. Do not encode expectations here that aren't in the
// corpus; add cases to the corpus instead.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as urn from '../src/index.js';
import { UrnParseError } from '../src/index.js';

type Case = {
  fn: string;
  in: unknown[];
  out?: unknown;
  throws?: string;
};

const corpusPath = fileURLToPath(new URL('../fixtures/corpus.json', import.meta.url));
const corpus = JSON.parse(readFileSync(corpusPath, 'utf8')) as { cases: Case[] };

// Dispatch table: corpus `fn` -> implementation. Keeping this explicit (rather
// than indexing `urn` by string) keeps the callable surface auditable.
const FNS: Record<string, (...args: any[]) => unknown> = {
  hasSchemePrefix: urn.hasSchemePrefix,
  normalizeScheme: urn.normalizeScheme,
  normalizeUrnForLookup: urn.normalizeUrnForLookup,
  legacyMemoryUrnToCanonical: urn.legacyMemoryUrnToCanonical,
  agentSlugFromUrn: urn.agentSlugFromUrn,
  validateUserSlug: urn.validateUserSlug,
  validateOrgSlug: urn.validateOrgSlug,
  deriveSlugFromName: urn.deriveSlugFromName,
};

describe('conformance corpus (v1 parity)', () => {
  it('covers every dispatchable function', () => {
    const covered = new Set(corpus.cases.map((c) => c.fn));
    for (const name of Object.keys(FNS)) {
      expect(covered, `no corpus case exercises ${name}`).toContain(name);
    }
  });

  for (const [i, c] of corpus.cases.entries()) {
    const label = `${c.fn}(${c.in.map((a) => JSON.stringify(a)).join(', ')})`;
    it(`#${i} ${label}`, () => {
      const fn = FNS[c.fn];
      if (typeof fn !== 'function') throw new Error(`unknown fn "${c.fn}" in corpus`);

      if (c.throws !== undefined) {
        try {
          fn(...c.in);
          throw new Error(`expected UrnParseError(${c.throws}), but no error was thrown`);
        } catch (err) {
          expect(err, 'thrown value should be a UrnParseError').toBeInstanceOf(UrnParseError);
          expect((err as UrnParseError).reason).toBe(c.throws);
        }
        return;
      }

      const got = fn(...c.in);
      if ('out' in c) {
        expect(got).toStrictEqual(c.out);
      }
      // else: void function that must not throw — reaching here is success.
    });
  }
});
