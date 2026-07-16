// Conformance test: runs the shared fixture corpus against this implementation.
// The corpus (fixtures/corpus.json) is the cross-language CONTRACT — urn-lib-go
// runs the identical file. Do not encode expectations here that aren't in the
// corpus; add cases to the corpus instead.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as urn from '../src/index.js';
import { UrnParseError, UrnNotQualifiedError } from '../src/index.js';

type Case = {
  fn: string;
  in: string[];
  out?: unknown;
  throws?: string;
  offendingSegment?: string;
  throwsQualified?: boolean;
  throwsAny?: boolean;
};

const corpusPath = fileURLToPath(new URL('../fixtures/corpus.json', import.meta.url));
const corpus = JSON.parse(readFileSync(corpusPath, 'utf8')) as { cases: Case[] };

// Dispatch table: corpus `fn` -> a call taking the raw string arg list. Kept
// explicit (rather than indexing `urn` by string) so the callable surface is
// auditable. Composite entries (…FromInput) exercise a chain through string args.
const FNS: Record<string, (a: string[]) => unknown> = {
  hasSchemePrefix: (a) => urn.hasSchemePrefix(a[0]!),
  normalizeScheme: (a) => urn.normalizeScheme(a[0]!),
  normalizeUrnForLookup: (a) => urn.normalizeUrnForLookup(a[0]!),
  legacyMemoryUrnToCanonical: (a) => urn.legacyMemoryUrnToCanonical(a[0]!),
  agentSlugFromUrn: (a) => urn.agentSlugFromUrn(a[0]!),
  validateUserSlug: (a) => urn.validateUserSlug(a[0]!),
  validateOrgSlug: (a) => urn.validateOrgSlug(a[0]!),
  deriveSlugFromName: (a) => urn.deriveSlugFromName(a[0]!),
  formatUrn: (a) => urn.formatUrn(a[0]!, a[1]!),
  parseUrnInput: (a) => urn.parseUrnInput(a[0]!),
  validateUrnTypeFromInput: (a) =>
    urn.validateUrnType(urn.parseUrnInput(a[0]!), a[1] as urn.LegacyUrnType),
  parseUrn: (a) => urn.parseUrn(a[0]!),
  isParserCanonical: (a) => urn.isParserCanonical(a[0]!),
  toParserCanonical: (a) => urn.toParserCanonical(a[0]!),
  formatCanonicalUrn: (a) => urn.formatCanonicalUrn(a[0] as urn.CanonicalUrnType, a[1]!),
  composeNodeUrn: (a) => urn.composeNodeUrn(a[0]!, a[1]!),
  composeEdgeUrn: (a) => urn.composeEdgeUrn(a[0]!, a[1]!),
  assertFullyQualifiedUrn: (a) => urn.assertFullyQualifiedUrn(a[0]!, a[1] as urn.ExpectedUrnType),
  splitNodeUrn: (a) => urn.splitNodeUrn(a[0]!),
  composeInstalledAgentUrn: (a) => urn.composeInstalledAgentUrn(a[0]!, a[1]!),
  parseForRow: (a) => urn.parseFor({ urn: a[0]!, urnNormalizedAt: a[1] === '1' ? new Date(0) : null }),
  parseDisplayUrn: (a) => urn.parseDisplayUrn(a[0]!, a[1] as urn.DisplayUrnType | undefined),
};

/** JSON round-trip so objects/null compare structurally across languages. */
function normalize(v: unknown): unknown {
  return JSON.parse(JSON.stringify(v ?? null));
}

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

      if (c.throwsQualified) {
        try {
          fn(c.in);
          throw new Error('expected UrnNotQualifiedError, but no error was thrown');
        } catch (err) {
          expect(err, 'thrown value should be a UrnNotQualifiedError').toBeInstanceOf(UrnNotQualifiedError);
        }
        return;
      }

      if (c.throwsAny) {
        expect(() => fn(c.in)).toThrow();
        return;
      }

      if (c.throws !== undefined) {
        try {
          fn(c.in);
          throw new Error(`expected UrnParseError(${c.throws}), but no error was thrown`);
        } catch (err) {
          expect(err, 'thrown value should be a UrnParseError').toBeInstanceOf(UrnParseError);
          expect((err as UrnParseError).reason).toBe(c.throws);
          if (c.offendingSegment !== undefined) {
            expect((err as UrnParseError).offendingSegment).toBe(c.offendingSegment);
          }
        }
        return;
      }

      const got = fn(c.in);
      if ('out' in c) {
        expect(normalize(got)).toStrictEqual(normalize(c.out));
      }
      // else: void function that must not throw — reaching here is success.
    });
  }
});
