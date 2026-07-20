import { daysSince } from '../lookup/dates.js'
import { lookupState } from '../core/state-codes.js'
import { classifyNameMatch } from './name-match.js'
import type { TaxpayerRecord } from '../lookup/types.js'
import type { AssessmentInput, RiskAssessment, RiskSignal, Verdict } from './types.js'

const NEWLY_REGISTERED_DAYS = 90
const STALE_FILING_DAYS = 90
const DORMANT_FILING_DAYS = 180

/**
 * Combines offline validation with live registry data into a verdict.
 *
 * Deliberately conservative about what it claims. A `pass` means "no adverse
 * signals were found", not "this counterparty is trustworthy" — a genuine,
 * active GSTIN can still appear on a fabricated invoice.
 */
export function assessRisk(input: AssessmentInput): RiskAssessment {
  const now = input.now ?? new Date()
  const signals: RiskSignal[] = []

  if (!input.validation.valid) {
    const reason = input.validation.errors[0]?.message ?? 'Failed offline validation.'
    return {
      verdict: 'reject',
      headline: 'Not a valid GSTIN',
      signals: [
        {
          code: 'MALFORMED',
          level: 'critical',
          title: 'Fails offline validation',
          detail: reason,
        },
      ],
    }
  }

  for (const warning of input.validation.warnings) {
    signals.push({
      code: warning.code,
      level: 'low',
      title: 'Structural note',
      detail: warning.message,
    })
  }

  if (input.lookupError) {
    signals.push({
      code: 'LOOKUP_UNAVAILABLE',
      level: 'medium',
      title: 'Could not verify against the GST registry',
      detail: `${input.lookupError} The number is well-formed, but its existence is unconfirmed.`,
    })
    return finalize(signals, 'unverified')
  }

  if (!input.lookup) {
    signals.push({
      code: 'NOT_CHECKED',
      level: 'medium',
      title: 'Registry not checked',
      detail:
        'Only offline checks ran. A fabricated number with a correct check digit would pass these.',
    })
    return finalize(signals, 'unverified')
  }

  if (!input.lookup.found) {
    signals.push({
      code: 'NOT_REGISTERED',
      level: 'critical',
      title: 'No such GSTIN in the GST registry',
      detail:
        'The number is well-formed but is not registered. This is the signature of a fabricated GSTIN.',
    })
    return finalize(signals, 'reject')
  }

  const record = input.lookup.record
  signals.push(...statusSignals(record))
  signals.push(...registrationAgeSignals(record, now))
  signals.push(...filingSignals(record, now))
  signals.push(...nameSignals(record, input.expectedName))
  signals.push(...stateSignals(input.validation.breakdown?.stateCode, input.expectedStateCode))

  return finalize(signals)
}

function statusSignals(record: TaxpayerRecord): RiskSignal[] {
  switch (record.status) {
    case 'Cancelled':
      return [
        {
          code: 'STATUS_CANCELLED',
          level: 'critical',
          title: 'Registration cancelled',
          detail: record.cancellationDate
            ? `Cancelled on ${record.cancellationDate}. Input tax credit on invoices dated after this will be denied.`
            : 'This registration has been cancelled. Input tax credit on its invoices will be denied.',
        },
      ]
    case 'Suspended':
      return [
        {
          code: 'STATUS_SUSPENDED',
          level: 'critical',
          title: 'Registration suspended',
          detail: 'Suspended registrations cannot lawfully issue tax invoices.',
        },
      ]
    case 'Provisional':
    case 'Inactive':
      return [
        {
          code: 'STATUS_NOT_ACTIVE',
          level: 'high',
          title: `Registration is ${record.status.toLowerCase()}`,
          detail: 'Only an Active registration should be issuing tax invoices.',
        },
      ]
    case 'Unknown':
      return [
        {
          code: 'STATUS_UNKNOWN',
          level: 'medium',
          title: 'Registration status not reported',
          detail: 'The registry did not return a status for this GSTIN.',
        },
      ]
    default:
      return []
  }
}

function registrationAgeSignals(record: TaxpayerRecord, now: Date): RiskSignal[] {
  const age = daysSince(record.registrationDate, now)
  if (age === undefined || age >= NEWLY_REGISTERED_DAYS) return []

  return [
    {
      code: 'NEWLY_REGISTERED',
      level: 'medium',
      title: 'Registered very recently',
      detail: `Registered ${age} day(s) ago. Legitimate for a new business, but shell entities used for fake invoicing are typically new. Weigh against transaction size.`,
    },
  ]
}

function filingSignals(record: TaxpayerRecord, now: Date): RiskSignal[] {
  const filedDates = record.filings
    .map((f) => f.filedOn)
    .filter((d): d is string => Boolean(d))
    .sort()

  const latest = filedDates.at(-1)
  if (!latest) {
    return record.status === 'Active'
      ? [
          {
            code: 'NO_FILING_HISTORY',
            level: 'high',
            title: 'No return filings on record',
            detail:
              'An active registration with no filing history is a strong dormant-entity signal.',
          },
        ]
      : []
  }

  const gap = daysSince(latest, now)
  if (gap === undefined) return []

  if (gap > DORMANT_FILING_DAYS) {
    return [
      {
        code: 'DORMANT_FILING',
        level: 'high',
        title: 'No returns filed recently',
        detail: `Last return filed ${gap} days ago (${latest}). Prolonged non-filing often precedes suo-motu cancellation, which can retrospectively void your input tax credit.`,
      },
    ]
  }

  if (gap > STALE_FILING_DAYS) {
    return [
      {
        code: 'STALE_FILING',
        level: 'medium',
        title: 'Filing is behind',
        detail: `Last return filed ${gap} days ago (${latest}).`,
      },
    ]
  }

  return []
}

function nameSignals(record: TaxpayerRecord, expectedName: string | undefined): RiskSignal[] {
  if (!expectedName?.trim()) return []

  const candidates = [record.legalName, record.tradeName].filter((n): n is string => Boolean(n))
  const verdicts = candidates.map((name) => classifyNameMatch(expectedName, name))
  const onRecord = candidates.join(' / ')

  if (verdicts.includes('match')) return []

  if (verdicts.includes('partial')) {
    return [
      {
        code: 'NAME_PARTIAL_MATCH',
        level: 'medium',
        title: 'Name only partially matches',
        detail: `You expected "${expectedName}"; the registry shows "${onRecord}". Confirm before paying.`,
      },
    ]
  }

  return [
    {
      code: 'NAME_MISMATCH',
      level: 'high',
      title: 'Name does not match the registry',
      detail: `You expected "${expectedName}"; this GSTIN belongs to "${onRecord}". A GSTIN quoted under someone else's name is a common invoice fraud.`,
    },
  ]
}

function stateSignals(
  actualCode: string | undefined,
  expectedCode: string | undefined,
): RiskSignal[] {
  if (!expectedCode || !actualCode || expectedCode === actualCode) return []

  const actual = lookupState(actualCode)?.name ?? actualCode
  const expected = lookupState(expectedCode)?.name ?? expectedCode

  return [
    {
      code: 'STATE_MISMATCH',
      level: 'medium',
      title: 'State does not match the expected address',
      detail: `This GSTIN is registered in ${actual}, but you expected ${expected}. Supplies are state-specific; a mismatch may mean the wrong GSTIN was quoted.`,
    },
  ]
}

/** Worst signal wins; two independent medium signals escalate to caution. */
function finalize(signals: RiskSignal[], override?: Verdict): RiskAssessment {
  const verdict = override ?? deriveVerdict(signals)
  return { verdict, headline: HEADLINES[verdict], signals }
}

function deriveVerdict(signals: readonly RiskSignal[]): Verdict {
  if (signals.some((s) => s.level === 'critical')) return 'reject'
  if (signals.some((s) => s.level === 'high')) return 'caution'
  if (signals.filter((s) => s.level === 'medium').length >= 2) return 'caution'
  if (signals.some((s) => s.level === 'medium')) return 'caution'
  return 'pass'
}

const HEADLINES: Record<Verdict, string> = {
  reject: 'Do not transact without resolving this',
  caution: 'Registered, but carries risk',
  pass: 'Registered and active, no adverse signals',
  unverified: 'Well-formed, but existence unconfirmed',
}
