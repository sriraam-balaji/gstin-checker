import { toTaxpayerRecord } from './gstn-fields.js'
import { LookupError } from './types.js'
import type { GstnFiling, GstnTaxpayer } from './gstn-fields.js'
import type { LookupOutcome, LookupProvider } from './types.js'

const BASE_URL = 'https://sheet.gstincheck.co.in/check'
const SOURCE = 'gstincheck'

/**
 * Response envelope, confirmed by probing the live endpoint:
 *   {"flag":false,"message":"API Key Invalid.","errorCode":"API_KEY_INVALID","data":{}}
 */
interface GstinCheckResponse {
  flag?: boolean
  message?: string
  errorCode?: string
  data?: (GstnTaxpayer & { filing?: GstnFiling[] }) | null
}

/**
 * errorCode values that mean "this GSTIN is genuinely not registered".
 * `GSTNUMBER_NOT_FOUND` is the code observed live; the others are defensive.
 */
const NOT_FOUND_CODES = new Set([
  'GSTNUMBER_NOT_FOUND',
  'GSTIN_NOT_FOUND',
  'GSTIN_INVALID',
  'NOT_FOUND',
  'INVALID_GSTIN',
])

/**
 * Vendors vary the exact spelling of their not-found code, so any code ending
 * in NOT_FOUND counts. Deliberately narrow: it must not swallow auth or credit
 * failures, which would report a lookup we never made as a missing GSTIN.
 */
function isNotFoundCode(code: string): boolean {
  return NOT_FOUND_CODES.has(code) || code.endsWith('NOT_FOUND')
}

const AUTH_CODES = new Set(['API_KEY_INVALID', 'API_KEY_EXPIRED', 'UNAUTHORIZED'])

const QUOTA_CODES = new Set([
  'CREDIT_INSUFFICIENT',
  'INSUFFICIENT_CREDIT',
  'LIMIT_EXCEEDED',
  'QUOTA_EXCEEDED',
  'NO_CREDITS',
])

export class GstinCheckProvider implements LookupProvider {
  readonly name = SOURCE

  constructor(private readonly apiKey: string) {
    if (!apiKey) {
      throw new LookupError('GSTINCheck API key is not configured.', 'config')
    }
  }

  async lookup(gstin: string): Promise<LookupOutcome> {
    const url = `${BASE_URL}/${encodeURIComponent(this.apiKey)}/${encodeURIComponent(gstin)}`

    let response: Response
    try {
      response = await fetch(url, { headers: { Accept: 'application/json' } })
    } catch (cause) {
      throw new LookupError(`Could not reach the verification service: ${cause}`, 'network')
    }

    if (response.status === 401 || response.status === 403) {
      throw new LookupError('Verification service rejected the API key.', 'auth')
    }
    if (response.status === 429) {
      throw new LookupError('Verification quota exhausted or rate limited.', 'quota')
    }
    if (!response.ok) {
      throw new LookupError(`Verification service returned HTTP ${response.status}.`, 'provider')
    }

    let body: GstinCheckResponse
    try {
      body = (await response.json()) as GstinCheckResponse
    } catch {
      throw new LookupError('Verification service returned a malformed response.', 'provider')
    }

    // The envelope reports failure via `flag`, not the HTTP status.
    if (body.flag !== true) {
      const code = body.errorCode ?? ''
      const message = body.message ?? 'Verification failed.'

      if (isNotFoundCode(code)) return { found: false, source: SOURCE }
      if (AUTH_CODES.has(code)) throw new LookupError(message, 'auth')
      if (QUOTA_CODES.has(code)) throw new LookupError(message, 'quota')

      /*
       * An unrecognised failure is deliberately NOT treated as "not registered".
       * Reporting an unknown provider error as a missing GSTIN would flag a
       * legitimate business as fabricated.
       */
      throw new LookupError(`${message}${code ? ` (${code})` : ''}`, 'provider')
    }

    const data = body.data
    if (!data || !data.gstin) {
      throw new LookupError(
        'Verification service reported success but returned no taxpayer data.',
        'provider',
      )
    }

    return {
      found: true,
      source: SOURCE,
      record: toTaxpayerRecord(data, data.filing, gstin, 'GSTINCheck'),
    }
  }
}
