/**
 * Fuzzy comparison of a user-supplied party name against the legal/trade name
 * on record. Corporate suffixes carry no identifying signal, so they are
 * stripped before comparison — "Acme Pvt Ltd" and "ACME PRIVATE LIMITED"
 * should score as identical.
 */

const NOISE_WORDS = new Set([
  'PRIVATE',
  'PVT',
  'LIMITED',
  'LTD',
  'LLP',
  'LLC',
  'INC',
  'INCORPORATED',
  'CORPORATION',
  'CORP',
  'COMPANY',
  'CO',
  'AND',
  'THE',
  'ENTERPRISES',
  'ENTERPRISE',
  'INDUSTRIES',
  'TRADERS',
  'SONS',
  'BROS',
  'BROTHERS',
])

export function normalizeName(name: string): string[] {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 0 && !NOISE_WORDS.has(token))
}

/** Jaccard similarity over significant tokens, in the range 0..1. */
export function nameSimilarity(a: string, b: string): number {
  const left = new Set(normalizeName(a))
  const right = new Set(normalizeName(b))

  if (left.size === 0 || right.size === 0) return 0

  let shared = 0
  for (const token of left) {
    if (right.has(token)) shared++
  }

  const union = left.size + right.size - shared
  return union === 0 ? 0 : shared / union
}

export type NameMatchVerdict = 'match' | 'partial' | 'mismatch'

export function classifyNameMatch(expected: string, actual: string): NameMatchVerdict {
  const score = nameSimilarity(expected, actual)
  if (score >= 0.65) return 'match'
  if (score >= 0.3) return 'partial'
  return 'mismatch'
}
