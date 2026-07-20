import { describe, test, expect, vi, afterEach } from 'vitest'
import { toIsoDate, daysSince } from '../src/lookup/dates.js'
import { AppyflowProvider } from '../src/lookup/appyflow-provider.js'
import { MockLookupProvider } from '../src/lookup/mock-provider.js'
import { LookupError } from '../src/lookup/types.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('toIsoDate', () => {
  test.each([
    ['01/07/2017', '2017-07-01'],
    ['1/7/2017', '2017-07-01'],
    ['01-07-2017', '2017-07-01'],
    ['2017-07-01', '2017-07-01'],
  ])('parses %s -> %s', (input, expected) => {
    expect(toIsoDate(input)).toBe(expected)
  })

  test.each([[undefined], [null], [''], ['not a date'], ['31/13/20']])(
    'returns undefined for %s rather than throwing',
    (input) => {
      expect(toIsoDate(input as string | undefined)).toBeUndefined()
    },
  )
})

describe('daysSince', () => {
  const now = new Date('2026-07-20T00:00:00Z')

  test('counts whole days elapsed', () => {
    expect(daysSince('2026-07-10', now)).toBe(10)
    expect(daysSince('2026-07-20', now)).toBe(0)
  })

  test('returns a negative count for future dates', () => {
    expect(daysSince('2026-07-25', now)).toBe(-5)
  })

  test('returns undefined for missing or unparseable input', () => {
    expect(daysSince(undefined, now)).toBeUndefined()
    expect(daysSince('garbage', now)).toBeUndefined()
  })
})

describe('MockLookupProvider', () => {
  test('reports an unknown GSTIN as not found', async () => {
    const result = await new MockLookupProvider().lookup('99ZZZZZ9999Z9ZZ')
    expect(result.found).toBe(false)
  })

  /*
   * Regression: fixture dates were once computed at module scope. The Workers
   * runtime restricts time during global initialization, so they resolved from
   * the Unix epoch — making every fixture look decades dormant in production
   * while passing locally. Dates must be derived per call.
   */
  test('derives filing dates at call time, not at module load', async () => {
    const provider = new MockLookupProvider()

    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-07-20T00:00:00Z'))
      const first = await provider.lookup('27AAPFU0939F1ZV')

      vi.setSystemTime(new Date('2027-01-15T00:00:00Z'))
      const second = await provider.lookup('27AAPFU0939F1ZV')

      expect(first.found && second.found).toBe(true)
      if (!first.found || !second.found) return

      expect(first.record.filings[0]!.filedOn).toBe('2026-06-30')
      expect(second.record.filings[0]!.filedOn).toBe('2026-12-26')
    } finally {
      vi.useRealTimers()
    }
  })

  test('the clean fixture stays recent enough to produce no filing signal', async () => {
    const result = await new MockLookupProvider().lookup('27AAPFU0939F1ZV')
    expect(result.found).toBe(true)
    if (!result.found) return

    const filedOn = result.record.filings[0]!.filedOn!
    const ageDays = (Date.now() - Date.parse(`${filedOn}T00:00:00Z`)) / 86_400_000
    expect(ageDays).toBeLessThan(90)
  })
})

function stubFetch(response: Partial<Response> & { json?: () => Promise<unknown> }): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}), ...response }) as Response),
  )
}

describe('AppyflowProvider', () => {
  test('refuses to construct without an API key', () => {
    expect(() => new AppyflowProvider('')).toThrow(LookupError)
  })

  test('maps a successful response onto the internal record shape', async () => {
    stubFetch({
      json: async () => ({
        taxpayerInfo: {
          gstin: '27AAPFU0939F1ZV',
          lgnm: 'ACME ENTERPRISES PRIVATE LIMITED',
          tradeNam: 'Acme',
          sts: 'Active',
          rgdt: '01/07/2017',
          ctb: 'Private Limited Company',
          dty: 'Regular',
          nba: ['Wholesale Business'],
          stj: 'Ward 4',
          pradr: { adr: '12 Example Road, Mumbai' },
        },
        filing: [{ rtntype: 'GSTR3B', ret_prd: '062026', dof: '05/07/2026' }],
      }),
    })

    const result = await new AppyflowProvider('key').lookup('27AAPFU0939F1ZV')

    expect(result.found).toBe(true)
    if (!result.found) return
    expect(result.record.legalName).toBe('ACME ENTERPRISES PRIVATE LIMITED')
    expect(result.record.status).toBe('Active')
    expect(result.record.registrationDate).toBe('2017-07-01')
    expect(result.record.address).toBe('12 Example Road, Mumbai')
    expect(result.record.filings).toEqual([
      { returnType: 'GSTR3B', period: '062026', filedOn: '2026-07-05' },
    ])
  })

  test.each([
    ['Active', 'Active'],
    ['cancelled', 'Cancelled'],
    ['Suspended', 'Suspended'],
    ['something else', 'Unknown'],
    [undefined, 'Unknown'],
  ])('normalizes status %s -> %s', async (raw, expected) => {
    stubFetch({
      json: async () => ({ taxpayerInfo: { gstin: '27AAPFU0939F1ZV', sts: raw } }),
    })

    const result = await new AppyflowProvider('key').lookup('27AAPFU0939F1ZV')
    expect(result.found && result.record.status).toBe(expected)
  })

  test('treats an explicit not-found error as a definitive negative', async () => {
    stubFetch({ json: async () => ({ error: true, message: 'GSTIN not found' }) })

    const result = await new AppyflowProvider('key').lookup('29AAGCB7383J1Z4')
    expect(result.found).toBe(false)
  })

  test.each([
    [401, 'auth'],
    [403, 'auth'],
    [429, 'quota'],
    [500, 'provider'],
  ])('turns HTTP %i into a %s LookupError', async (status, kind) => {
    stubFetch({ ok: false, status })

    await expect(new AppyflowProvider('key').lookup('27AAPFU0939F1ZV')).rejects.toMatchObject({
      name: 'LookupError',
      kind,
    })
  })

  test('surfaces a network failure as a LookupError rather than crashing', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNRESET')
      }),
    )

    await expect(new AppyflowProvider('key').lookup('27AAPFU0939F1ZV')).rejects.toMatchObject({
      kind: 'network',
    })
  })

  test('surfaces malformed JSON as a LookupError', async () => {
    stubFetch({
      json: async () => {
        throw new Error('bad json')
      },
    })

    await expect(new AppyflowProvider('key').lookup('27AAPFU0939F1ZV')).rejects.toMatchObject({
      kind: 'provider',
    })
  })

  /*
   * Regression: an inactive key is served a canned sample record for a
   * different taxpayer. Rendering that would attribute a real company to a
   * GSTIN that may not exist — the worst failure available to a fraud tool.
   */
  test('rejects a response describing a different GSTIN than the one requested', async () => {
    stubFetch({
      json: async () => ({
        taxpayerInfo: {
          gstin: '03DOXPM4071K1ZE',
          lgnm: 'DISHANT MAHAJAN',
          tradeNam: 'AppyFlow Technologies',
          sts: 'Active',
        },
      }),
    })

    await expect(new AppyflowProvider('key').lookup('27AAPFU0939F1ZV')).rejects.toMatchObject({
      name: 'LookupError',
      kind: 'provider',
    })
  })

  /*
   * Captured from a real production response. The principal address arrives as
   * a component object under `pradr.addr`, not the flat `pradr.adr` string the
   * adapter originally expected, so addresses silently came back empty.
   */
  test('composes the principal address from real response components', async () => {
    stubFetch({
      json: async () => ({
        taxpayerInfo: {
          gstin: '03DOXPM4071K1ZE',
          lgnm: 'DISHANT MAHAJAN',
          tradeNam: 'AppyFlow Technologies',
          sts: 'Active',
          rgdt: '17/12/2019',
          cxdt: '',
          ctb: 'Proprietorship',
          dty: 'Regular',
          nba: ['Office / Sale Office'],
          stj: 'Ludhiana 3 - Ward No.54',
          pradr: {
            addr: {
              bnm: '',
              loc: 'Ganesh Nagar',
              st: 'Street no 1',
              bno: '3018 Shop no 5',
              stcd: 'Punjab',
              dst: 'Ludhiana',
              city: '',
              flno: '',
              pncd: '141008',
            },
          },
        },
        compliance: { filingFrequency: null },
        filing: [],
        error: false,
      }),
    })

    const result = await new AppyflowProvider('key').lookup('03DOXPM4071K1ZE')

    expect(result.found).toBe(true)
    if (!result.found) return
    expect(result.record.address).toBe(
      '3018 Shop no 5, Street no 1, Ganesh Nagar, Ludhiana, Punjab, 141008',
    )
    expect(result.record.registrationDate).toBe('2019-12-17')
    // An empty cxdt must not become an Invalid Date.
    expect(result.record.cancellationDate).toBeUndefined()
    expect(result.record.constitution).toBe('Proprietorship')
  })

  test('accepts a matching GSTIN regardless of casing', async () => {
    stubFetch({
      json: async () => ({
        taxpayerInfo: { gstin: '27aapfu0939f1zv', lgnm: 'ACME', sts: 'Active' },
      }),
    })

    const result = await new AppyflowProvider('key').lookup('27AAPFU0939F1ZV')
    expect(result.found).toBe(true)
  })

  test('does not silently treat an unexplained empty payload as "not registered"', async () => {
    stubFetch({ json: async () => ({}) })

    await expect(new AppyflowProvider('key').lookup('27AAPFU0939F1ZV')).rejects.toBeInstanceOf(
      LookupError,
    )
  })
})
