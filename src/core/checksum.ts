import { charValue, valueChar } from './charset.js'

const BODY_LENGTH = 14
const MODULUS = 36

/**
 * Computes the 15th character of a GSTIN from its first 14.
 *
 * Weighted mod-36: each character's value is multiplied by an alternating
 * factor of 1 and 2, then the quotient and remainder of that product divided
 * by 36 are both added to a running sum. The check digit is whatever brings
 * that sum up to the next multiple of 36.
 */
export function computeCheckDigit(body: string): string {
  if (body.length !== BODY_LENGTH) {
    throw new RangeError(`expected 14 characters, received ${body.length}`)
  }

  let sum = 0
  for (let i = 0; i < BODY_LENGTH; i++) {
    const value = charValue(body[i]!)
    if (value < 0) {
      throw new RangeError(`invalid character ${JSON.stringify(body[i])} at position ${i + 1}`)
    }
    const factor = i % 2 === 0 ? 1 : 2
    const product = value * factor
    sum += Math.floor(product / MODULUS) + (product % MODULUS)
  }

  return valueChar((MODULUS - (sum % MODULUS)) % MODULUS)
}

/** True when the final character of a 15-character GSTIN matches its computed check digit. */
export function verifyCheckDigit(gstin: string): boolean {
  if (gstin.length !== 15) return false
  try {
    return computeCheckDigit(gstin.slice(0, 14)) === gstin[14]
  } catch {
    return false
  }
}
