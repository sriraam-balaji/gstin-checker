import type { LookupOutcome, LookupProvider, TaxpayerRecord } from './types.js'

const SOURCE = 'mock'

function daysAgoIso(days: number, now = new Date()): string {
  return new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10)
}

function record(overrides: Partial<TaxpayerRecord> & Pick<TaxpayerRecord, 'gstin'>): TaxpayerRecord {
  return {
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
      { returnType: 'GSTR3B', period: '052026', filedOn: daysAgoIso(20) },
      { returnType: 'GSTR1', period: '052026', filedOn: daysAgoIso(25) },
    ],
    ...overrides,
  }
}

/**
 * Deterministic fixtures covering every branch of the risk engine, so the full
 * pipeline can be developed and tested without spending API credits.
 */
const FIXTURES: Readonly<Record<string, TaxpayerRecord | null>> = {
  // Clean, active, well-filed.
  '27AAPFU0939F1ZV': record({ gstin: '27AAPFU0939F1ZV' }),

  // Structurally valid but absent from the registry — the fabricated-number case.
  '29AAGCB7383J1Z4': null,

  '07AAACI1195H1ZO': record({
    gstin: '07AAACI1195H1ZO',
    legalName: 'CANCELLED TRADERS LLP',
    tradeName: undefined,
    status: 'Cancelled',
    cancellationDate: '2024-11-30',
    filings: [{ returnType: 'GSTR3B', period: '102024', filedOn: '2024-11-15' }],
  }),

  '06AABCT3518Q1Z0': record({
    gstin: '06AABCT3518Q1Z0',
    legalName: 'DORMANT SUPPLIES PRIVATE LIMITED',
    status: 'Active',
    filings: [{ returnType: 'GSTR3B', period: '062025', filedOn: daysAgoIso(400) }],
  }),

  '24AAACC1206D1ZM': record({
    gstin: '24AAACC1206D1ZM',
    legalName: 'BRAND NEW VENTURES LLP',
    tradeName: 'Brand New',
    registrationDate: daysAgoIso(21),
    filings: [],
  }),

  '33AAAAP0267H2ZU': record({
    gstin: '33AAAAP0267H2ZU',
    legalName: 'SUSPENDED METALS AND ALLOYS PRIVATE LIMITED',
    status: 'Suspended',
  }),
}

export class MockLookupProvider implements LookupProvider {
  readonly name = SOURCE

  constructor(private readonly fixtures = FIXTURES) {}

  async lookup(gstin: string): Promise<LookupOutcome> {
    const fixture = this.fixtures[gstin]
    if (fixture === undefined || fixture === null) {
      return { found: false, source: SOURCE }
    }
    return { found: true, record: fixture, source: SOURCE }
  }
}

export const MOCK_GSTINS = Object.keys(FIXTURES)
