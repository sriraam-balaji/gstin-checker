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

export type LookupOutcome =
  | { readonly found: true; readonly record: TaxpayerRecord; readonly source: string }
  | { readonly found: false; readonly source: string }

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
