import { describe, test, expect } from 'vitest'
import { validateGstin, normalizeGstin } from '../src/core/validate.js'

const VALID = '27AAPFU0939F1ZV'

describe('normalizeGstin', () => {
  test('uppercases and strips spaces and hyphens', () => {
    expect(normalizeGstin(' 27aapfu0939f1zv ')).toBe(VALID)
    expect(normalizeGstin('27-AAPFU-0939F-1ZV')).toBe(VALID)
    expect(normalizeGstin('27 AAPFU 0939F 1ZV')).toBe(VALID)
  })
})

describe('validateGstin — accepts well-formed input', () => {
  test('accepts a known-good GSTIN', () => {
    const result = validateGstin(VALID)
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.normalized).toBe(VALID)
  })

  test('accepts lowercase and punctuated input after normalization', () => {
    expect(validateGstin('27-aapfu-0939f-1zv').valid).toBe(true)
  })

  test('exposes the parsed breakdown on success', () => {
    const { breakdown } = validateGstin(VALID)
    expect(breakdown).toBeDefined()
    expect(breakdown!.stateCode).toBe('27')
    expect(breakdown!.stateName).toBe('Maharashtra')
    expect(breakdown!.pan).toBe('AAPFU0939F')
    expect(breakdown!.entityCode).toBe('1')
    expect(breakdown!.defaultChar).toBe('Z')
    expect(breakdown!.checkDigit).toBe('V')
    expect(breakdown!.entityType).toBe('Firm / LLP')
  })
})

describe('validateGstin — rejects malformed input', () => {
  test('rejects empty input', () => {
    const r = validateGstin('   ')
    expect(r.valid).toBe(false)
    expect(r.errors[0]!.code).toBe('EMPTY')
  })

  test('rejects wrong length with the actual length in the message', () => {
    const r = validateGstin('27AAPFU0939F1Z')
    expect(r.valid).toBe(false)
    expect(r.errors[0]!.code).toBe('LENGTH')
    expect(r.errors[0]!.message).toMatch(/14/)
  })

  test('rejects characters outside A-Z0-9', () => {
    const r = validateGstin('27AAPFU0939F1Z*')
    expect(r.valid).toBe(false)
    expect(r.errors.map((e) => e.code)).toContain('CHARSET')
  })

  test('rejects a structurally wrong layout', () => {
    // digits where the embedded PAN expects letters
    const r = validateGstin('27123FU0939F1ZV')
    expect(r.valid).toBe(false)
    expect(r.errors.map((e) => e.code)).toContain('STRUCTURE')
  })

  test('rejects an unknown state code', () => {
    const r = validateGstin('49AAPFU0939F1ZP')
    expect(r.valid).toBe(false)
    expect(r.errors.map((e) => e.code)).toContain('STATE_CODE')
  })

  test('rejects a non-Z 14th character', () => {
    const r = validateGstin('27AAPFU0939F1AV')
    expect(r.valid).toBe(false)
    expect(r.errors.map((e) => e.code)).toContain('STRUCTURE')
  })

  test('rejects a bad check digit and reports the expected one', () => {
    const r = validateGstin('27AAPFU0939F1ZX')
    expect(r.valid).toBe(false)
    const err = r.errors.find((e) => e.code === 'CHECKSUM')
    expect(err).toBeDefined()
    expect(err!.message).toMatch(/V/)
    expect(r.expectedCheckDigit).toBe('V')
  })
})

describe('validateGstin — warnings do not fail validation', () => {
  test('flags obsolete state code 28 (pre-bifurcation Andhra Pradesh) as a warning', () => {
    const r = validateGstin('28AAPFU0939F1ZT')
    expect(r.valid).toBe(true)
    expect(r.warnings.map((w) => w.code)).toContain('OBSOLETE_STATE_CODE')
  })
})
