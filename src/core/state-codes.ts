/**
 * GST state codes (first two characters of a GSTIN).
 * `obsolete` marks codes no longer issued but still present on historic registrations.
 */
export interface StateInfo {
  readonly name: string
  readonly obsolete?: string
}

export const STATE_CODES: Readonly<Record<string, StateInfo>> = {
  '01': { name: 'Jammu and Kashmir' },
  '02': { name: 'Himachal Pradesh' },
  '03': { name: 'Punjab' },
  '04': { name: 'Chandigarh' },
  '05': { name: 'Uttarakhand' },
  '06': { name: 'Haryana' },
  '07': { name: 'Delhi' },
  '08': { name: 'Rajasthan' },
  '09': { name: 'Uttar Pradesh' },
  '10': { name: 'Bihar' },
  '11': { name: 'Sikkim' },
  '12': { name: 'Arunachal Pradesh' },
  '13': { name: 'Nagaland' },
  '14': { name: 'Manipur' },
  '15': { name: 'Mizoram' },
  '16': { name: 'Tripura' },
  '17': { name: 'Meghalaya' },
  '18': { name: 'Assam' },
  '19': { name: 'West Bengal' },
  '20': { name: 'Jharkhand' },
  '21': { name: 'Odisha' },
  '22': { name: 'Chhattisgarh' },
  '23': { name: 'Madhya Pradesh' },
  '24': { name: 'Gujarat' },
  '25': {
    name: 'Daman and Diu',
    obsolete: 'Merged into code 26 (Dadra and Nagar Haveli and Daman and Diu) in January 2020',
  },
  '26': { name: 'Dadra and Nagar Haveli and Daman and Diu' },
  '27': { name: 'Maharashtra' },
  '28': {
    name: 'Andhra Pradesh (pre-bifurcation)',
    obsolete: 'Replaced by code 37 after the 2014 Telangana bifurcation',
  },
  '29': { name: 'Karnataka' },
  '30': { name: 'Goa' },
  '31': { name: 'Lakshadweep' },
  '32': { name: 'Kerala' },
  '33': { name: 'Tamil Nadu' },
  '34': { name: 'Puducherry' },
  '35': { name: 'Andaman and Nicobar Islands' },
  '36': { name: 'Telangana' },
  '37': { name: 'Andhra Pradesh' },
  '38': { name: 'Ladakh' },
  '97': { name: 'Other Territory' },
  '99': { name: 'Centre Jurisdiction' },
}

export function lookupState(code: string): StateInfo | undefined {
  return STATE_CODES[code]
}
