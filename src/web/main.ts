import { validateGstin } from '../core/validate.js'
import { assessRisk } from '../risk/assess.js'
import { STATE_CODES } from '../core/state-codes.js'
import { renderAssessment, populateStates } from './render.js'
import type { RiskAssessment } from '../risk/types.js'
import type { TaxpayerRecord } from '../lookup/types.js'

/** Hosted entry point: the API key stays server-side behind a Pages Function. */

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

populateStates(stateSelect, STATE_CODES)

form.addEventListener('submit', (event) => {
  event.preventDefault()
  void check()
})

async function check(): Promise<void> {
  const expectedName = expectedNameInput.value.trim() || undefined
  const expectedStateCode = stateSelect.value || undefined

  // Offline first: a malformed number never reaches the paid lookup.
  const validation = validateGstin(gstinInput.value)
  if (!validation.valid) {
    renderAssessment(
      results,
      assessRisk({ validation, expectedName, expectedStateCode }),
      validation,
      null,
    )
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
      renderAssessment(
        results,
        assessRisk({ validation, lookupError: detail, expectedName, expectedStateCode }),
        validation,
        null,
      )
      return
    }

    const payload = (await response.json()) as VerifyResponse
    renderAssessment(results, payload.assessment, validation, payload.record)
  } catch {
    renderAssessment(
      results,
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
