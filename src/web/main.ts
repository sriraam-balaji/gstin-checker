import { validateGstin } from '../core/validate.js'
import { assessRisk } from '../risk/assess.js'
import { STATE_CODES } from '../core/state-codes.js'
import type { RiskAssessment } from '../risk/types.js'
import type { TaxpayerRecord } from '../lookup/types.js'

interface VerifyResponse {
  assessment: RiskAssessment
  record: TaxpayerRecord | null
}

const form = document.querySelector<HTMLFormElement>('#check-form')!
const gstinInput = document.querySelector<HTMLInputElement>('#gstin')!
const expectedNameInput = document.querySelector<HTMLInputElement>('#expected-name')!
const stateSelect = document.querySelector<HTMLSelectElement>('#expected-state')!
const submitButton = document.querySelector<HTMLButtonElement>('#submit')!
const results = document.querySelector<HTMLElement>('#results')!

populateStates()

form.addEventListener('submit', (event) => {
  event.preventDefault()
  void check()
})

function populateStates(): void {
  const entries = Object.entries(STATE_CODES)
    .filter(([, info]) => !info.obsolete)
    .sort(([, a], [, b]) => a.name.localeCompare(b.name))

  for (const [code, info] of entries) {
    const option = document.createElement('option')
    option.value = code
    option.textContent = `${info.name} (${code})`
    stateSelect.append(option)
  }
}

async function check(): Promise<void> {
  const expectedName = expectedNameInput.value.trim() || undefined
  const expectedStateCode = stateSelect.value || undefined

  // Offline first: a malformed number never reaches the paid lookup.
  const validation = validateGstin(gstinInput.value)
  if (!validation.valid) {
    render(assessRisk({ validation, expectedName, expectedStateCode }), validation, null)
    return
  }

  setBusy(true)
  try {
    const response = await fetch('/api/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gstin: validation.normalized, expectedName, expectedStateCode }),
    })

    if (!response.ok) {
      const detail = await describeHttpFailure(response)
      render(
        assessRisk({ validation, lookupError: detail, expectedName, expectedStateCode }),
        validation,
        null,
      )
      return
    }

    const payload = (await response.json()) as VerifyResponse
    render(payload.assessment, validation, payload.record)
  } catch {
    render(
      assessRisk({
        validation,
        lookupError: 'The verification service could not be reached.',
        expectedName,
        expectedStateCode,
      }),
      validation,
      null,
    )
  } finally {
    setBusy(false)
  }
}

async function describeHttpFailure(response: Response): Promise<string> {
  if (response.status === 401) return 'Not signed in to the verification service.'
  if (response.status === 429) return 'Verification rate limit reached — try again later.'
  try {
    const body = (await response.json()) as { message?: string }
    if (body.message) return body.message
  } catch {
    /* fall through to the generic message */
  }
  return `Verification service returned HTTP ${response.status}.`
}

function setBusy(busy: boolean): void {
  submitButton.disabled = busy
  submitButton.textContent = busy ? 'Checking…' : 'Check GSTIN'
}

function render(
  assessment: RiskAssessment,
  validation: ReturnType<typeof validateGstin>,
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

function verdictBanner(assessment: RiskAssessment): HTMLElement {
  const labels: Record<RiskAssessment['verdict'], string> = {
    reject: 'Reject',
    caution: 'Caution',
    pass: 'Pass',
    unverified: 'Unverified',
  }

  const section = document.createElement('div')
  section.className = `verdict verdict--${assessment.verdict}`

  const label = document.createElement('p')
  label.className = 'verdict__label'
  label.textContent = labels[assessment.verdict]

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
