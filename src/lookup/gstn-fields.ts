import { toIsoDate } from './dates.js'
import { LookupError } from './types.js'
import type { FilingRecord, TaxpayerRecord, TaxpayerStatus } from './types.js'

/**
 * Field names used by GSTN's Search Taxpayer response.
 *
 * These are the government schema's names, not any one vendor's, so resellers
 * generally pass them through unchanged. Shared here so every provider adapter
 * maps them identically.
 */
export interface GstnTaxpayer {
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
  stjCd?: string
  panNo?: string
  pradr?: { addr?: GstnAddress; adr?: string }
}

export interface GstnAddress {
  bno?: string
  bnm?: string
  flno?: string
  st?: string
  loc?: string
  city?: string
  dst?: string
  stcd?: string
  pncd?: string
}

export interface GstnFiling {
  rtntype?: string
  ret_prd?: string
  dof?: string
}

export function normalizeStatus(raw: string | undefined): TaxpayerStatus {
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

/**
 * The principal address arrives as separate components, most of which are
 * routinely blank, so they are joined in postal order and empties dropped.
 */
export function formatAddress(pradr: GstnTaxpayer['pradr']): string | undefined {
  if (!pradr) return undefined
  if (pradr.adr) return pradr.adr

  const a = pradr.addr
  if (!a) return undefined

  const line = [a.bno, a.bnm, a.flno, a.st, a.loc, a.city, a.dst, a.stcd, a.pncd]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(', ')

  return line || undefined
}

export function mapFilings(raw: GstnFiling[] | undefined): FilingRecord[] {
  if (!Array.isArray(raw)) return []
  return raw.map((f) => ({
    returnType: f.rtntype ?? 'Unknown',
    period: f.ret_prd ?? '',
    filedOn: toIsoDate(f.dof),
  }))
}

/**
 * Converts a GSTN taxpayer block into the internal record shape.
 *
 * `requestedGstin` is mandatory: the response must describe the number that was
 * asked about. Providers have been observed serving a canned sample record for
 * a different taxpayer when a key is inactive, which would otherwise render as
 * though it were the real owner of the number the user typed. Attributing the
 * wrong identity is worse than returning no answer at all.
 */
export function toTaxpayerRecord(
  info: GstnTaxpayer,
  filings: GstnFiling[] | undefined,
  requestedGstin: string,
  providerName: string,
): TaxpayerRecord {
  if (!info.gstin) {
    throw new LookupError(
      `${providerName} returned a taxpayer record with no GSTIN field.`,
      'provider',
    )
  }

  if (info.gstin.toUpperCase() !== requestedGstin.toUpperCase()) {
    // Leads with the consequence for the reader; the diagnostic detail follows.
    throw new LookupError(
      'The registry check is not active, so this number could not be looked up. ' +
        `(${providerName} is in sandbox mode — it returned a sample record for ${info.gstin} ` +
        `instead of real data for ${requestedGstin}. Activating paid credits fixes this.)`,
      'provider',
    )
  }

  return {
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
    address: formatAddress(info.pradr),
    filings: mapFilings(filings),
  }
}
