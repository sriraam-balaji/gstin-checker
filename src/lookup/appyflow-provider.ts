import { toIsoDate } from './dates.js'
import { LookupError } from './types.js'
import type { FilingRecord, LookupOutcome, LookupProvider, TaxpayerStatus } from './types.js'

const ENDPOINT = 'https://appyflow.in/api/verifyGST'
const SOURCE = 'appyflow'

/** Shape of the taxpayer block Appyflow returns. Fields are best-effort. */
interface AppyflowTaxpayer {
  gstin?: string
  lgnm?: string
  tradeNam?: string
  sts?: string
  rgdt?: string
  cxdt?: string
  ctb?: string
  dty?: string
  nba?: string[]
  stj?: string
  pradr?: { adr?: string }
}

interface AppyflowResponse {
  taxpayerInfo?: AppyflowTaxpayer
  filing?: { rtntype?: string; ret_prd?: string; dof?: string }[]
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
      throw new LookupError(body.message || 'Verification service returned no taxpayer data.', 'provider')
    }

    /*
     * The response must describe the GSTIN we asked about. Unactivated keys are
     * served a canned sample record for a different taxpayer, which would
     * otherwise be rendered as though it were the real owner of the number the
     * user typed — attributing a real company to an unknown GSTIN. Attributing
     * the wrong identity is worse than returning no answer at all.
     */
    if (info.gstin.toUpperCase() !== gstin.toUpperCase()) {
      throw new LookupError(
        `Verification service returned data for ${info.gstin} instead of ${gstin}. ` +
          'This usually means the API key is inactive or still in demo mode — the response is a sample record, not real data.',
        'provider',
      )
    }

    return {
      found: true,
      source: SOURCE,
      record: {
        gstin: info.gstin,
        legalName: info.lgnm ?? 'Unknown',
        tradeName: info.tradeNam || undefined,
        status: normalizeStatus(info.sts),
        registrationDate: toIsoDate(info.rgdt),
        cancellationDate: toIsoDate(info.cxdt),
        constitution: info.ctb || undefined,
        taxpayerType: info.dty || undefined,
        natureOfBusiness: info.nba ?? [],
        stateJurisdiction: info.stj || undefined,
        address: info.pradr?.adr || undefined,
        filings: mapFilings(body.filing),
      },
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

function normalizeStatus(raw: string | undefined): TaxpayerStatus {
  switch (raw?.trim().toLowerCase()) {
    case 'active':
      return 'Active'
    case 'cancelled':
    case 'canceled':
      return 'Cancelled'
    case 'suspended':
      return 'Suspended'
    case 'provisional':
      return 'Provisional'
    case 'inactive':
      return 'Inactive'
    default:
      return 'Unknown'
  }
}

function mapFilings(raw: AppyflowResponse['filing']): FilingRecord[] {
  if (!Array.isArray(raw)) return []
  return raw.map((f) => ({
    returnType: f.rtntype ?? 'Unknown',
    period: f.ret_prd ?? '',
    filedOn: toIsoDate(f.dof),
  }))
}
