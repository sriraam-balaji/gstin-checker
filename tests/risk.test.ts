import { describe, test, expect } from 'vitest'
import { validateGstin } from '../src/core/validate.js'
import { assessRisk } from '../src/risk/assess.js'
import { classifyNameMatch, nameSimilarity } from '../src/risk/name-match.js'
import { MockLookupProvider } from '../src/lookup/mock-provider.js'
import type { LookupOutcome, TaxpayerRecord } from '../src/lookup/types.js'

const NOW = new Date('2026-07-20T00:00:00Z')
const provider = new MockLookupProvider()

async function assess(gstin: string, extra: Record<string, unknown> = {}) {
  const validation = validateGstin(gstin)
  const lookup = validation.valid ? await provider.lookup(validation.normalized) : undefined
  return assessRisk({ validation, lookup, now: NOW, ...extra })
}

function found(overrides: Partial<TaxpayerRecord>): LookupOutcome {
  return {
    found: true,
    source: 'test',
    record: {
      gstin: '27AAPFU0939F1ZV',
      legalName: 'ACME ENTERPRISES PRIVATE LIMITED',
      tradeName: 'Acme',
      status: 'Active',
      registrationDate: '2018-04-01',
      cancellationDate: undefined,
      constitution: 'Private Limited Company',
      taxpayerType: 'Regular',
      natureOfBusiness: [],
      stateJurisdiction: undefined,
      address: undefined,
      filings: [{ returnType: 'GSTR3B', period: '062026', filedOn: '2026-07-05' }],
      ...overrides,
    },
  }
}

describe('verdict — the headline question', () => {
  test('a clean active registration passes', async () => {
    const r = await assess('27AAPFU0939F1ZV')
    expect(r.verdict).toBe('pass')
    expect(r.signals).toEqual([])
  })

  test('a malformed GSTIN is rejected without any lookup', async () => {
    const r = await assess('27AAPFU0939F1ZX')
    expect(r.verdict).toBe('reject')
    expect(r.signals[0]!.code).toBe('MALFORMED')
  })

  test('a well-formed but unregistered GSTIN is rejected as fabricated', async () => {
    const r = await assess('29AAGCB7383J1Z4')
    expect(r.verdict).toBe('reject')
    expect(r.signals.map((s) => s.code)).toContain('NOT_REGISTERED')
  })

  test('a cancelled registration is rejected', async () => {
    const r = await assess('07AAACI1195H1ZO')
    expect(r.verdict).toBe('reject')
    expect(r.signals.map((s) => s.code)).toContain('STATUS_CANCELLED')
  })

  test('a suspended registration is rejected', async () => {
    const r = await assess('33AAAAP0267H2ZU')
    expect(r.verdict).toBe('reject')
    expect(r.signals.map((s) => s.code)).toContain('STATUS_SUSPENDED')
  })

  test('a long-dormant filer raises caution', async () => {
    const r = await assess('06AABCT3518Q1Z0')
    expect(r.verdict).toBe('caution')
    expect(r.signals.map((s) => s.code)).toContain('DORMANT_FILING')
  })

  test('a brand-new registration with no filings raises caution', async () => {
    const r = await assess('24AAACC1206D1ZM')
    expect(r.verdict).toBe('caution')
    const codes = r.signals.map((s) => s.code)
    expect(codes).toContain('NEWLY_REGISTERED')
    expect(codes).toContain('NO_FILING_HISTORY')
  })
})

describe('an unavailable lookup is never reported as fraud', () => {
  test('a provider failure yields "unverified", not "reject"', () => {
    const r = assessRisk({
      validation: validateGstin('27AAPFU0939F1ZV'),
      lookupError: 'Verification quota exhausted.',
      now: NOW,
    })
    expect(r.verdict).toBe('unverified')
    expect(r.signals.map((s) => s.code)).toContain('LOOKUP_UNAVAILABLE')
  })

  test('offline-only checking yields "unverified" and says so', () => {
    const r = assessRisk({ validation: validateGstin('27AAPFU0939F1ZV'), now: NOW })
    expect(r.verdict).toBe('unverified')
    expect(r.signals.map((s) => s.code)).toContain('NOT_CHECKED')
  })
})

describe('name matching', () => {
  test('ignores corporate suffixes and casing', () => {
    expect(nameSimilarity('Acme Pvt Ltd', 'ACME PRIVATE LIMITED')).toBe(1)
    expect(classifyNameMatch('Acme Pvt Ltd', 'ACME PRIVATE LIMITED')).toBe('match')
  })

  test('flags a completely different name as a mismatch', () => {
    expect(classifyNameMatch('Acme Steel', 'Bharat Textiles')).toBe('mismatch')
  })

  test('a matching expected name produces no signal', () => {
    const r = assessRisk({
      validation: validateGstin('27AAPFU0939F1ZV'),
      lookup: found({}),
      expectedName: 'Acme Enterprises Pvt Ltd',
      now: NOW,
    })
    expect(r.verdict).toBe('pass')
  })

  test('a mismatched expected name escalates to caution', () => {
    const r = assessRisk({
      validation: validateGstin('27AAPFU0939F1ZV'),
      lookup: found({}),
      expectedName: 'Completely Different Trading',
      now: NOW,
    })
    expect(r.verdict).toBe('caution')
    expect(r.signals.map((s) => s.code)).toContain('NAME_MISMATCH')
  })
})

describe('state cross-check', () => {
  test('flags a GSTIN registered in a different state than expected', () => {
    const r = assessRisk({
      validation: validateGstin('27AAPFU0939F1ZV'),
      lookup: found({}),
      expectedStateCode: '33',
      now: NOW,
    })
    expect(r.signals.map((s) => s.code)).toContain('STATE_MISMATCH')
  })

  test('produces no signal when the state matches', () => {
    const r = assessRisk({
      validation: validateGstin('27AAPFU0939F1ZV'),
      lookup: found({}),
      expectedStateCode: '27',
      now: NOW,
    })
    expect(r.verdict).toBe('pass')
  })
})
