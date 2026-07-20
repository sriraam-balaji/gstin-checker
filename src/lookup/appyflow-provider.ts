import { toTaxpayerRecord } from './gstn-fields.js'
import { LookupError } from './types.js'
import type { GstnFiling, GstnTaxpayer } from './gstn-fields.js'
import type { LookupOutcome, LookupProvider } from './types.js'

const ENDPOINT = 'https://appyflow.in/api/verifyGST'
const SOURCE = 'appyflow'

interface AppyflowResponse {
  taxpayerInfo?: GstnTaxpayer
  filing?: GstnFiling[]
  error?: boolean | string
  message?: string
}

export class AppyflowProvider implements LookupProvider {
  readonly name = SOURCE

  constructor(private readonly apiKey: string) {
    if (!apiKey) {
      throw new LookupError('Appyflow API key is not configured.', 'config')
    }
  }

  async lookup(gstin: string): Promise<LookupOutcome> {
    const url = `${ENDPOINT}?gstNo=${encodeURIComponent(gstin)}&key_secret=${encodeURIComponent(this.apiKey)}`

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

    let body: AppyflowResponse
    try {
      body = (await response.json()) as AppyflowResponse
    } catch {
      throw new LookupError('Verification service returned a malformed response.', 'provider')
    }

    const info = body.taxpayerInfo
    if (!info || !info.gstin) {
      // Appyflow signals an unregistered GSTIN via an error flag rather than 404.
      if (isNotFound(body)) return { found: false, source: SOURCE }
      throw new LookupError(
        body.message || 'Verification service returned no taxpayer data.',
        'provider',
      )
    }

    return {
      found: true,
      source: SOURCE,
      record: toTaxpayerRecord(info, body.filing, gstin, 'Appyflow'),
    }
  }
}

function isNotFound(body: AppyflowResponse): boolean {
  const message = String(body.message ?? '').toLowerCase()
  return (
    Boolean(body.error) &&
    (message.includes('not found') ||
      message.includes('invalid gstin') ||
      message.includes('no records'))
  )
}
