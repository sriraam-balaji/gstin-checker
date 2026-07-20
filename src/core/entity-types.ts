/**
 * The 4th character of a PAN (10th character of a GSTIN) encodes the
 * legal constitution of the registered entity.
 */
export const ENTITY_TYPES: Readonly<Record<string, string>> = {
  A: 'Association of Persons (AOP)',
  B: 'Body of Individuals (BOI)',
  C: 'Company',
  E: 'Limited Liability Partnership',
  F: 'Firm / LLP',
  G: 'Government',
  H: 'Hindu Undivided Family (HUF)',
  J: 'Artificial Juridical Person',
  K: 'Trust (Krish)',
  L: 'Local Authority',
  P: 'Individual / Proprietor',
  T: 'Trust',
}

export function lookupEntityType(char: string): string | undefined {
  return ENTITY_TYPES[char]
}
