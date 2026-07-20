import { computeCheckDigit } from './checksum.js'
import { lookupState } from './state-codes.js'
import { lookupEntityType } from './entity-types.js'
import { parseGstin } from './parse.js'
import type { ValidationError, ValidationResult, ValidationWarning } from './types.js'

/**
 * Structural layout of a GSTIN:
 *   [0-9]{2}    state code
 *   [A-Z]{5}    PAN — entity name block
 *   [0-9]{4}    PAN — serial
 *   [A-Z]       PAN — check letter
 *   [1-9A-Z]    registration count for this PAN within the state
 *   Z           fixed default character
 *   [0-9A-Z]    check digit
 */
const STRUCTURE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/
const ALLOWED_CHARS = /^[0-9A-Z]+$/
const GSTIN_LENGTH = 15

/** Uppercases and strips the separators people paste in from invoices. */
export function normalizeGstin(input: string): string {
  return input.toUpperCase().replace(/[\s\-_.]/g, '')
}

/**
 * Validates a GSTIN offline: structure, state code, embedded PAN and check digit.
 *
 * Proves a GSTIN is well-formed, not that it exists. A fabricated number with a
 * correct check digit passes here — only a live GSTN lookup closes that gap.
 */
export function validateGstin(input: string): ValidationResult {
  const normalized = normalizeGstin(input)
  const errors: ValidationError[] = []
  const warnings: ValidationWarning[] = []

  const fail = (result: Partial<ValidationResult> = {}): ValidationResult => ({
    valid: false,
    input,
    normalized,
    errors,
    warnings,
    breakdown: undefined,
    expectedCheckDigit: undefined,
    ...result,
  })

  if (normalized.length === 0) {
    errors.push({ code: 'EMPTY', message: 'Enter a GSTIN.' })
    return fail()
  }

  if (normalized.length !== GSTIN_LENGTH) {
    errors.push({
      code: 'LENGTH',
      message: `A GSTIN is 15 characters; this one is ${normalized.length}.`,
    })
    return fail()
  }

  if (!ALLOWED_CHARS.test(normalized)) {
    const bad = [...new Set(normalized.split('').filter((c) => !/[0-9A-Z]/.test(c)))]
    errors.push({
      code: 'CHARSET',
      message: `A GSTIN uses only A-Z and 0-9. Found: ${bad.join(', ')}`,
    })
    return fail()
  }

  if (!STRUCTURE.test(normalized)) {
    errors.push({ code: 'STRUCTURE', message: describeStructureFailure(normalized) })
    return fail()
  }

  const stateCode = normalized.slice(0, 2)
  const state = lookupState(stateCode)
  if (!state) {
    errors.push({
      code: 'STATE_CODE',
      message: `"${stateCode}" is not an assigned GST state code.`,
    })
    return fail()
  }
  if (state.obsolete) {
    warnings.push({
      code: 'OBSOLETE_STATE_CODE',
      message: `State code ${stateCode} (${state.name}) is no longer issued. ${state.obsolete}`,
    })
  }

  if (!lookupEntityType(normalized[5]!)) {
    warnings.push({
      code: 'UNKNOWN_ENTITY_TYPE',
      message: `"${normalized[5]}" is not a recognised PAN entity-type letter.`,
    })
  }

  const expected = computeCheckDigit(normalized.slice(0, 14))
  if (expected !== normalized[14]) {
    errors.push({
      code: 'CHECKSUM',
      message: `Check digit mismatch — got "${normalized[14]}", expected "${expected}". Usually a typo in one of the first 14 characters.`,
    })
    return fail({ expectedCheckDigit: expected })
  }

  return {
    valid: true,
    input,
    normalized,
    errors,
    warnings,
    breakdown: parseGstin(normalized),
    expectedCheckDigit: undefined,
  }
}

/** Points at the first position group that broke, rather than just saying "malformed". */
function describeStructureFailure(gstin: string): string {
  const checks: readonly [RegExp, string][] = [
    [/^[0-9]{2}/, 'characters 1-2 must be a two-digit state code'],
    [/^.{2}[A-Z]{5}/, 'characters 3-7 must be letters (PAN name block)'],
    [/^.{7}[0-9]{4}/, 'characters 8-11 must be digits (PAN serial)'],
    [/^.{11}[A-Z]/, 'character 12 must be a letter (PAN check letter)'],
    [/^.{12}[1-9A-Z]/, 'character 13 must be 1-9 or A-Z (registration count)'],
    [/^.{13}Z/, 'character 14 must be "Z"'],
  ]

  const failed = checks.find(([pattern]) => !pattern.test(gstin))
  return failed ? `Wrong format — ${failed[1]}.` : 'Wrong format.'
}
