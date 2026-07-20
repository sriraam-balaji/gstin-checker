/**
 * The mod-36 alphabet used by the GSTIN check-digit algorithm.
 * Index position is the character's numeric value: '0'->0 ... 'Z'->35.
 */
export const CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'

/** Numeric value of a character in the mod-36 alphabet, or -1 if not a member. */
export function charValue(char: string): number {
  return CHARSET.indexOf(char)
}

/** Character for a numeric value in the mod-36 alphabet. */
export function valueChar(value: number): string {
  const char = CHARSET[value]
  if (char === undefined) {
    throw new RangeError(`value ${value} is outside the mod-36 alphabet`)
  }
  return char
}
