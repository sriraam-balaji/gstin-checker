import { describe, test, expect, vi, afterEach } from 'vitest'
import { GstinCheckProvider } from '../src/lookup/gstincheck-provider.js'
import { LookupError } from '../src/lookup/types.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

function stubJson(payload: unknown, init: Partial<Response> = {}): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        ({ ok: true, status: 200, json: async () => payload, ...init }) as unknown as Response,
    ),
  )
}

const GSTIN = '27AAPFU0939F1ZV'

function taxpayer(overrides: Record<string, unknown> = {}) {
  return {
    gstin: GSTIN,
    lgnm: 'ACME ENTERPRISES PRIVATE LIMITED',
    tradeNam: 'Acme',
    sts: 'Active',
    rgdt: '17/12/2019',
    cxdt: '',
    ctb: 'Private Limited Company',
    dty: 'Regular',
    nba: ['Wholesale Business'],
    stj: 'Ward 4',
    pradr: {
      addr: {
        bno: '12',
        st: 'Example Road',
        loc: 'Andheri',
        dst: 'Mumbai',
        stcd: 'Maharashtra',
        pncd: '400001',
      },
    },
    filing: [{ rtntype: 'GSTR3B', ret_prd: '062026', dof: '05/07/2026' }],
    ...overrides,
  }
}

describe('GstinCheckProvider', () => {
  test('refuses to construct without an API key', () => {
    expect(() => new GstinCheckProvider('')).toThrow(LookupError)
  })

  test('maps a successful envelope onto the internal record shape', async () => {
    stubJson({ flag: true, message: 'success', data: taxpayer() })

    const result = await new GstinCheckProvider('key').lookup(GSTIN)

    expect(result.found).toBe(true)
    if (!result.found) return
    expect(result.record.legalName).toBe('ACME ENTERPRISES PRIVATE LIMITED')
    expect(result.record.status).toBe('Active')
    expect(result.record.registrationDate).toBe('2019-12-17')
    expect(result.record.cancellationDate).toBeUndefined()
    expect(result.record.address).toBe('12, Example Road, Andheri, Mumbai, Maharashtra, 400001')
    expect(result.record.filings).toEqual([
      { returnType: 'GSTR3B', period: '062026', filedOn: '2026-07-05' },
    ])
  })

  /* GSTNUMBER_NOT_FOUND is the code the live API actually returns. */
  test.each([
    ['GSTNUMBER_NOT_FOUND'],
    ['GSTIN_NOT_FOUND'],
    ['GSTIN_INVALID'],
    ['SOME_VENDOR_NOT_FOUND'],
  ])('treats errorCode %s as a definitive negative', async (errorCode) => {
    stubJson({ flag: false, message: 'GST Number not found', errorCode, data: {} })

    const result = await new GstinCheckProvider('key').lookup(GSTIN)
    expect(result.found).toBe(false)
  })

  test.each([['API_KEY_INVALID'], ['CREDIT_INSUFFICIENT']])(
    'does not let %s be mistaken for a not-found result',
    async (errorCode) => {
      stubJson({ flag: false, message: 'nope', errorCode, data: {} })

      await expect(new GstinCheckProvider('key').lookup(GSTIN)).rejects.toBeInstanceOf(LookupError)
    },
  )

  /* Captured verbatim from the live endpoint with a bogus key. */
  test('maps the real API_KEY_INVALID envelope to an auth error', async () => {
    stubJson({
      flag: false,
      message: 'API Key Invalid.',
      errorCode: 'API_KEY_INVALID',
      data: {},
    })

    await expect(new GstinCheckProvider('key').lookup(GSTIN)).rejects.toMatchObject({
      name: 'LookupError',
      kind: 'auth',
    })
  })

  test('maps a credit-exhaustion errorCode to a quota error', async () => {
    stubJson({ flag: false, message: 'No credits', errorCode: 'CREDIT_INSUFFICIENT', data: {} })

    await expect(new GstinCheckProvider('key').lookup(GSTIN)).rejects.toMatchObject({
      kind: 'quota',
    })
  })

  /*
   * The critical negative case: an unrecognised failure must not be reported as
   * "not registered", which would brand a legitimate business as fabricated.
   */
  test('does not treat an unrecognised errorCode as "not registered"', async () => {
    stubJson({ flag: false, message: 'Upstream timeout', errorCode: 'SOMETHING_NEW', data: {} })

    await expect(new GstinCheckProvider('key').lookup(GSTIN)).rejects.toMatchObject({
      kind: 'provider',
    })
  })

  test('rejects a response describing a different GSTIN than requested', async () => {
    stubJson({ flag: true, data: taxpayer({ gstin: '03DOXPM4071K1ZE' }) })

    await expect(new GstinCheckProvider('key').lookup(GSTIN)).rejects.toMatchObject({
      kind: 'provider',
    })
  })

  test('rejects a success flag carrying no taxpayer data', async () => {
    stubJson({ flag: true, message: 'ok', data: {} })

    await expect(new GstinCheckProvider('key').lookup(GSTIN)).rejects.toBeInstanceOf(LookupError)
  })

  test.each([
    [401, 'auth'],
    [429, 'quota'],
    [500, 'provider'],
  ])('turns HTTP %i into a %s LookupError', async (status, kind) => {
    stubJson({}, { ok: false, status })

    await expect(new GstinCheckProvider('key').lookup(GSTIN)).rejects.toMatchObject({ kind })
  })

  test('surfaces a network failure as a LookupError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNRESET')
      }),
    )

    await expect(new GstinCheckProvider('key').lookup(GSTIN)).rejects.toMatchObject({
      kind: 'network',
    })
  })

  test('sends the key and GSTIN in the URL path over HTTPS', async () => {
    const spy = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        ({
          ok: true,
          status: 200,
          json: async () => ({ flag: true, data: taxpayer() }),
        }) as unknown as Response,
    )
    vi.stubGlobal('fetch', spy)

    await new GstinCheckProvider('my-key').lookup(GSTIN)

    const called = spy.mock.calls[0]?.[0] ?? ''
    expect(called).toBe(`https://sheet.gstincheck.co.in/check/my-key/${GSTIN}`)
    expect(called.startsWith('https://')).toBe(true)
  })
})
