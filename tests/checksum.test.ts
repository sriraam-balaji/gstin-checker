import { describe, test, expect } from 'vitest'
import { CHARSET, charValue } from '../src/core/charset.js'
import { computeCheckDigit, verifyCheckDigit } from '../src/core/checksum.js'

describe('charset', () => {
  test('maps digits to their numeric value', () => {
    expect(charValue('0')).toBe(0)
    expect(charValue('9')).toBe(9)
  })

  test('maps letters to 10-35', () => {
    expect(charValue('A')).toBe(10)
    expect(charValue('V')).toBe(31)
    expect(charValue('Z')).toBe(35)
  })

  test('returns -1 for characters outside the mod-36 alphabet', () => {
    expect(charValue('-')).toBe(-1)
    expect(charValue('a')).toBe(-1)
  })

  test('alphabet covers exactly 36 symbols', () => {
    expect(CHARSET).toHaveLength(36)
  })
})

describe('computeCheckDigit', () => {
  // Hand-verified against the published GSTN mod-36 algorithm.
  test('computes the documented check digit for a known GSTIN', () => {
    expect(computeCheckDigit('27AAPFU0939F1Z')).toBe('V')
  })

  test.each([
    ['27AAPFU0939F1Z', 'V'],
    ['29AAGCB7383J1Z', '4'],
    ['07AAACI1195H1Z', 'O'],
    ['06AABCT3518Q1Z', '0'],
  ])('computes %s -> %s', (body, expected) => {
    expect(computeCheckDigit(body)).toBe(expected)
  })

  test('throws when given anything other than 14 characters', () => {
    expect(() => computeCheckDigit('27AAPFU0939F1')).toThrow(/14 characters/)
    expect(() => computeCheckDigit('27AAPFU0939F1ZV')).toThrow(/14 characters/)
  })

  test('throws on characters outside the alphabet', () => {
    expect(() => computeCheckDigit('27AAPFU0939F1-')).toThrow(/invalid character/i)
  })
})

describe('verifyCheckDigit', () => {
  test('accepts a GSTIN whose 15th character matches', () => {
    expect(verifyCheckDigit('27AAPFU0939F1ZV')).toBe(true)
  })

  test('rejects a GSTIN whose 15th character does not match', () => {
    expect(verifyCheckDigit('27AAPFU0939F1ZX')).toBe(false)
  })

  // Round-trip: for every possible final symbol, exactly one must verify.
  test('exactly one of the 36 possible check digits verifies', () => {
    const body = '27AAPFU0939F1Z'
    const accepted = CHARSET.split('').filter((c) => verifyCheckDigit(body + c))
    expect(accepted).toEqual(['V'])
  })
})
