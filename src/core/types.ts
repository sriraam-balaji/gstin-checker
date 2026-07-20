export type ValidationErrorCode =
  | 'EMPTY'
  | 'LENGTH'
  | 'CHARSET'
  | 'STRUCTURE'
  | 'STATE_CODE'
  | 'CHECKSUM'

export type ValidationWarningCode = 'OBSOLETE_STATE_CODE' | 'UNKNOWN_ENTITY_TYPE'

export interface ValidationIssue<C extends string> {
  readonly code: C
  readonly message: string
}

export type ValidationError = ValidationIssue<ValidationErrorCode>
export type ValidationWarning = ValidationIssue<ValidationWarningCode>

/** Positional decomposition of a structurally valid GSTIN. */
export interface GstinBreakdown {
  readonly stateCode: string
  readonly stateName: string
  readonly pan: string
  readonly entityCode: string
  readonly entityType: string | undefined
  readonly defaultChar: string
  readonly checkDigit: string
}

export interface ValidationResult {
  readonly valid: boolean
  readonly input: string
  readonly normalized: string
  readonly errors: readonly ValidationError[]
  readonly warnings: readonly ValidationWarning[]
  readonly breakdown: GstinBreakdown | undefined
  /** Populated when the structure is sound but the check digit is wrong. */
  readonly expectedCheckDigit: string | undefined
}
