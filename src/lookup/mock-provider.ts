import type { LookupOutcome, LookupProvider, TaxpayerRecord } from './types.js'

const SOURCE = 'mock'

/**
 * Fixtures are built per-request, never at module scope.
 *
 * The Workers runtime restricts time and randomness during global
 * initialization, so a top-level `new Date()` resolves from the Unix epoch and
 * can fail the isolate outright. Everything time-dependent is therefore
 * computed inside `lookup()`, where a request context exists.
 */
function daysAgoIso(days: number, now: Date): string {
  return new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10)
}

function buildFixtures(now: Date): Record<string, TaxpayerRecord | null> {
  const base = (
    overrides: Partial<TaxpayerRecord> & Pick<TaxpayerRecord, 'gstin'>,
  ): TaxpayerRecord => ({
    legalName: 'MOCK ENTERPRISES PRIVATE LIMITED',
    tradeName: 'Mock Enterprises',
    status: 'Active',
    registrationDate: '2018-04-01',
    cancellationDate: undefined,
    constitution: 'Private Limited Company',
    taxpayerType: 'Regular',
    natureOfBusiness: ['Wholesale Business', 'Supplier of Services'],
    stateJurisdiction: 'State - Mock Ward 4',
    address: '12 Example Road, Mock City, 400001',
    filings: [
      { returnType: 'GSTR3B', period: '052026', filedOn: daysAgoIso(20, now) },
      { returnType: 'GSTR1', period: '052026', filedOn: daysAgoIso(25, now) },
    ],
    ...overrides,
  })

  return {
    // Clean, active, well-filed.
    '27AAPFU0939F1ZV': base({ gstin: '27AAPFU0939F1ZV' }),

    // Structurally valid but absent from the registry — the fabricated-number case.
    '29AAGCB7383J1Z4': null,

    '07AAACI1195H1ZO': base({
      gstin: '07AAACI1195H1ZO',
      legalName: 'CANCELLED TRADERS LLP',
      tradeName: undefined,
      status: 'Cancelled',
      cancellationDate: '2024-11-30',
      filings: [{ returnType: 'GSTR3B', period: '102024', filedOn: '2024-11-15' }],
    }),

    '06AABCT3518Q1Z0': base({
      gstin: '06AABCT3518Q1Z0',
      legalName: 'DORMANT SUPPLIES PRIVATE LIMITED',
      status: 'Active',
      filings: [{ returnType: 'GSTR3B', period: '062025', filedOn: daysAgoIso(400, now) }],
    }),

    '24AAACC1206D1ZM': base({
      gstin: '24AAACC1206D1ZM',
      legalName: 'BRAND NEW VENTURES LLP',
      tradeName: 'Brand New',
      registrationDate: daysAgoIso(21, now),
      filings: [],
    }),

    '33AAAAP0267H2ZU': base({
      gstin: '33AAAAP0267H2ZU',
      legalName: 'SUSPENDED METALS AND ALLOYS PRIVATE LIMITED',
      status: 'Suspended',
    }),
  }
}

export class MockLookupProvider implements LookupProvider {
  readonly name = SOURCE

  async lookup(gstin: string): Promise<LookupOutcome> {
    const fixture = buildFixtures(new Date())[gstin]
    if (fixture === undefined || fixture === null) {
      return { found: false, source: SOURCE }
    }
    return { found: true, record: fixture, source: SOURCE }
  }
}

/** The GSTINs the mock knows about, for docs and manual testing. */
export const MOCK_GSTINS = [
  '27AAPFU0939F1ZV',
  '29AAGCB7383J1Z4',
  '07AAACI1195H1ZO',
  '06AABCT3518Q1Z0',
  '24AAACC1206D1ZM',
  '33AAAAP0267H2ZU',
] as const
