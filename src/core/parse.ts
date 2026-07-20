import { lookupState } from './state-codes.js'
import { lookupEntityType } from './entity-types.js'
import type { GstinBreakdown } from './types.js'

/**
 * Splits a 15-character GSTIN into its constituent parts.
 * Assumes the structural regex has already passed.
 */
export function parseGstin(gstin: string): GstinBreakdown {
  const stateCode = gstin.slice(0, 2)
  const pan = gstin.slice(2, 12)

  return {
    stateCode,
    stateName: lookupState(stateCode)?.name ?? 'Unknown',
    pan,
    entityCode: gstin.slice(12, 13),
    entityType: lookupEntityType(pan[3]!),
    defaultChar: gstin.slice(13, 14),
    checkDigit: gstin.slice(14, 15),
  }
}
