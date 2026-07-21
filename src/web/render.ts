import type { ValidationResult } from '../core/types.js'
import type { RiskAssessment } from '../risk/types.js'
import type { TaxpayerRecord } from '../lookup/types.js'

/**
 * Renders an assessment into a container. Shared by both entry points: the
 * hosted build (which asks a Pages Function) and the standalone file (which
 * calls the provider directly from the browser).
 */
export function renderAssessment(
  results: HTMLElement,
  assessment: RiskAssessment,
  validation: ValidationResult,
  record: TaxpayerRecord | null,
): void {
  results.replaceChildren()
  results.append(verdictBanner(assessment))

  if (assessment.signals.length > 0) {
    results.append(signalList(assessment.signals))
  }

  if (record) {
    results.append(
      detailTable('On the GST registry', [
        ['Legal name', record.legalName],
        ['Trade name', record.tradeName],
        ['Status', record.status],
        ['Registered on', record.registrationDate],
        ['Cancelled on', record.cancellationDate],
        ['Constitution', record.constitution],
        ['Taxpayer type', record.taxpayerType],
        ['Nature of business', record.natureOfBusiness.join(', ') || undefined],
        ['Jurisdiction', record.stateJurisdiction],
        ['Principal address', record.address],
      ]),
    )
  }

  const b = validation.breakdown
  if (b) {
    results.append(
      detailTable(
        'How the number breaks down',
        [
          ['Characters 1–2', `${b.stateCode} — ${b.stateName}`],
          ['Characters 3–12 (PAN)', b.pan],
          ['PAN entity type', b.entityType ?? 'Unrecognised'],
          ['Character 13', `${b.entityCode} — registration count in this state`],
          ['Character 14', `${b.defaultChar} — fixed default`],
          ['Character 15', `${b.checkDigit} — check digit, verified`],
        ],
        true,
      ),
    )
  }

  results.hidden = false
  results.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
}

const VERDICT_LABELS: Record<RiskAssessment['verdict'], string> = {
  reject: 'Reject',
  caution: 'Caution',
  pass: 'Pass',
  unverified: 'Unverified',
}

function verdictBanner(assessment: RiskAssessment): HTMLElement {
  const section = document.createElement('div')
  section.className = `verdict verdict--${assessment.verdict}`

  const label = document.createElement('p')
  label.className = 'verdict__label'
  label.textContent = VERDICT_LABELS[assessment.verdict]

  const headline = document.createElement('p')
  headline.className = 'verdict__headline'
  headline.textContent = assessment.headline

  section.append(label, headline)
  return section
}

function signalList(signals: RiskAssessment['signals']): HTMLElement {
  const list = document.createElement('ul')
  list.className = 'signals'

  for (const signal of signals) {
    const item = document.createElement('li')
    item.className = `signal signal--${signal.level}`

    const title = document.createElement('p')
    title.className = 'signal__title'

    const level = document.createElement('span')
    level.className = 'signal__level'
    level.textContent = signal.level

    title.append(level, document.createTextNode(signal.title))

    const detail = document.createElement('p')
    detail.className = 'signal__detail'
    detail.textContent = signal.detail

    item.append(title, detail)
    list.append(item)
  }

  return list
}

function detailTable(
  heading: string,
  rows: readonly (readonly [string, string | undefined])[],
  mono = false,
): HTMLElement {
  const section = document.createElement('section')
  section.className = 'detail'

  const title = document.createElement('h3')
  title.className = 'detail__heading'
  title.textContent = heading

  const table = document.createElement('table')
  table.className = 'detail__table'
  const body = document.createElement('tbody')

  for (const [key, value] of rows) {
    if (!value) continue
    const row = document.createElement('tr')

    const th = document.createElement('th')
    th.scope = 'row'
    th.textContent = key

    const td = document.createElement('td')
    if (mono) td.className = 'detail__code'
    td.textContent = value

    row.append(th, td)
    body.append(row)
  }

  table.append(body)
  section.append(title, table)
  return section
}

/** Populates a state <select> with the non-obsolete GST state codes. */
export function populateStates(
  select: HTMLSelectElement,
  states: Readonly<Record<string, { name: string; obsolete?: string }>>,
): void {
  const entries = Object.entries(states)
    .filter(([, info]) => !info.obsolete)
    .sort(([, a], [, b]) => a.name.localeCompare(b.name))

  for (const [code, info] of entries) {
    const option = document.createElement('option')
    option.value = code
    option.textContent = `${info.name} (${code})`
    select.append(option)
  }
}
