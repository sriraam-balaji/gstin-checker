export type TaxpayerStatus =
  | 'Active'
  | 'Cancelled'
  | 'Suspended'
  | 'Provisional'
  | 'Inactive'
  | 'Unknown'

export interface FilingRecord {
  readonly returnType: string
  readonly period: string
  readonly filedOn: string | undefined
}

export interface TaxpayerRecord {
  readonly gstin: string
  readonly legalName: string
  readonly tradeName: string | undefined
  readonly status: TaxpayerStatus
  /** ISO yyyy-mm-dd */
  readonly registrationDate: string | undefined
  readonly cancellationDate: string | undefined
  readonly constitution: string | undefined
  readonly taxpayerType: string | undefined
  readonly natureOfBusiness: readonly string[]
  readonly stateJurisdiction: string | undefined
  readonly address: string | undefined
  readonly filings: readonly FilingRecord[]
}

/**
 * Evidence that a result came from a live call rather than canned data.
 * Surfaced in the UI so a reviewer can confirm the tool is really querying the
 * registry. `endpoint` always has the API key redacted — this is shown on
 * screen and must be safe to display to someone else.
 */
export interface LookupDiagnostics {
  readonly provider: string
  readonly endpoint: string
  readonly httpStatus: number
  readonly durationMs: number
  readonly fetchedAt: string
  readonly rawResponse: string
}

export type LookupOutcome =
  | {
      readonly found: true
      readonly record: TaxpayerRecord
      readonly source: string
      readonly diagnostics?: LookupDiagnostics
    }
  | {
      readonly found: false
      readonly source: string
      readonly diagnostics?: LookupDiagnostics
    }

/** Replaces the API key in a URL with a placeholder before it is displayed. */
export function redactKey(url: string, key: string): string {
  if (!key) return url
  return url.split(encodeURIComponent(key)).join('***KEY-REDACTED***').split(key).join('***KEY-REDACTED***')
}

/**
 * Thrown when the lookup could not be completed. Deliberately distinct from a
 * `found: false` result — "we could not check" must never be reported to the
 * user as "this GSTIN is fake".
 */
export class LookupError extends Error {
  constructor(
    message: string,
    readonly kind: 'auth' | 'quota' | 'network' | 'provider' | 'config',
  ) {
    super(message)
    this.name = 'LookupError'
  }
}

export interface LookupProvider {
  readonly name: string
  lookup(gstin: string): Promise<LookupOutcome>
}
