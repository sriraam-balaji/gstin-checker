import { validateGstin } from '../core/validate.js'
import { STATE_CODES } from '../core/state-codes.js'
import { assessRisk } from '../risk/assess.js'
import { GstinCheckProvider } from '../lookup/gstincheck-provider.js'
import { LookupError } from '../lookup/types.js'
import { renderAssessment, populateStates } from './render.js'
import type { LookupOutcome } from '../lookup/types.js'

/**
 * Offline-capable entry point.
 *
 * Talks to the verification API directly from the browser rather than through
 * a server function, so the whole tool is one file that can be opened from
 * disk. The API key is never baked into that file — it is entered once and
 * kept in localStorage, so the file itself carries no secret and can be copied
 * or emailed freely.
 */

const KEY_STORAGE = 'gstin-checker.apiKey'

const form = document.querySelector<HTMLFormElement>('#check-form')!
const gstinInput = document.querySelector<HTMLInputElement>('#gstin')!
const expectedNameInput = document.querySelector<HTMLInputElement>('#expected-name')!
const stateSelect = document.querySelector<HTMLSelectElement>('#expected-state')!
const submitButton = document.querySelector<HTMLButtonElement>('#submit')!
const results = document.querySelector<HTMLElement>('#results')!
const apiKeyInput = document.querySelector<HTMLInputElement>('#api-key')!
const apiKeyStatus = document.querySelector<HTMLElement>('#api-key-status')!

populateStates(stateSelect, STATE_CODES)
restoreApiKey()

apiKeyInput.addEventListener('change', saveApiKey)
apiKeyInput.addEventListener('blur', saveApiKey)

form.addEventListener('submit', (event) => {
  event.preventDefault()
  void check()
})

function restoreApiKey(): void {
  try {
    const stored = localStorage.getItem(KEY_STORAGE)
    if (stored) {
      apiKeyInput.value = stored
      showKeyStatus('Key loaded from this browser.')
      return
    }
  } catch {
    /* localStorage can be blocked by policy; the field still works per-session */
  }
  showKeyStatus('No key saved. Registry checks are unavailable until you add one.')
}

function saveApiKey(): void {
  const value = apiKeyInput.value.trim()
  try {
    if (value) {
      localStorage.setItem(KEY_STORAGE, value)
      showKeyStatus('Key saved in this browser.')
    } else {
      localStorage.removeItem(KEY_STORAGE)
      showKeyStatus('Key cleared. Registry checks are unavailable.')
    }
  } catch {
    showKeyStatus('Key kept for this session only — storage is blocked by browser policy.')
  }
}

function showKeyStatus(message: string): void {
  apiKeyStatus.textContent = message
}

async function check(): Promise<void> {
  const expectedName = expectedNameInput.value.trim() || undefined
  const expectedStateCode = stateSelect.value || undefined
  const apiKey = apiKeyInput.value.trim()

  // Offline first: a malformed number never reaches the metered API.
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

  if (!apiKey) {
    renderAssessment(
      results,
      assessRisk({
        validation,
        lookupError: 'No API key entered, so the GST registry was not contacted.',
        expectedName,
        expectedStateCode,
      }),
      validation,
      null,
    )
    return
  }

  setBusy(true)
  let lookup: LookupOutcome | undefined
  let lookupError: string | undefined

  try {
    lookup = await new GstinCheckProvider(apiKey).lookup(validation.normalized)
  } catch (error) {
    lookupError =
      error instanceof LookupError
        ? error.message
        : 'The verification service could not be reached. Check this machine has internet access to sheet.gstincheck.co.in.'
  } finally {
    setBusy(false)
  }

  const assessment = assessRisk({
    validation,
    lookup,
    lookupError,
    expectedName,
    expectedStateCode,
    now: new Date(),
  })

  renderAssessment(results, assessment, validation, lookup?.found ? lookup.record : null)
}

function setBusy(busy: boolean): void {
  submitButton.disabled = busy
  submitButton.textContent = busy ? 'Checking…' : 'Check GSTIN'
}
