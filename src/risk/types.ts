import type { ValidationResult } from '../core/types.js'
import type { LookupOutcome } from '../lookup/types.js'

export type RiskLevel = 'critical' | 'high' | 'medium' | 'low'

/**
 * `reject`     — do not transact on this GSTIN without resolving the issue
 * `caution`    — real and registered, but carries risk worth a second look
 * `pass`       — no adverse signals found
 * `unverified` — structurally sound, but existence could NOT be checked
 */
export type Verdict = 'reject' | 'caution' | 'pass' | 'unverified'

export interface RiskSignal {
  readonly code: string
  readonly level: RiskLevel
  readonly title: string
  readonly detail: string
}

export interface RiskAssessment {
  readonly verdict: Verdict
  readonly headline: string
  readonly signals: readonly RiskSignal[]
}

export interface AssessmentInput {
  readonly validation: ValidationResult
  /** Omitted when no live lookup was attempted. */
  readonly lookup?: LookupOutcome | undefined
  /** Set when a lookup was attempted but could not complete. */
  readonly lookupError?: string | undefined
  readonly expectedName?: string | undefined
  readonly expectedStateCode?: string | undefined
  readonly now?: Date
}
