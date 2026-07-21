import { validateGstin } from '../../src/core/validate.js'
import { assessRisk } from '../../src/risk/assess.js'
import { MockLookupProvider } from '../../src/lookup/mock-provider.js'
import { AppyflowProvider } from '../../src/lookup/appyflow-provider.js'
import { GstinCheckProvider } from '../../src/lookup/gstincheck-provider.js'
import { LookupError } from '../../src/lookup/types.js'
import type { LookupOutcome, LookupProvider } from '../../src/lookup/types.js'
import { json, type Env } from '../_shared.js'

const CACHE_TTL_SECONDS = 60 * 60 * 24
const DEFAULT_DAILY_CAP = 200

interface VerifyBody {
  gstin?: string
  expectedName?: string
  expectedStateCode?: string
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: VerifyBody
  try {
    body = (await request.json()) as VerifyBody
  } catch {
    return json({ message: 'Malformed request.' }, 400)
  }

  const validation = validateGstin(String(body.gstin ?? ''))
  const expectedName = body.expectedName?.trim() || undefined
  const expectedStateCode = body.expectedStateCode?.trim() || undefined

  // Never spend a lookup on a number that already failed offline.
  if (!validation.valid) {
    return json({
      assessment: assessRisk({ validation, expectedName, expectedStateCode }),
      record: null,
    })
  }

  const gstin = validation.normalized
  const cached = await readCache(env, gstin)

  let lookup: LookupOutcome | undefined
  let lookupError: string | undefined

  if (cached) {
    lookup = cached
  } else {
    const capped = await isOverDailyCap(env)
    if (capped) {
      lookupError = 'Daily verification limit reached for this deployment.'
    } else {
      try {
        lookup = await resolveProvider(env).lookup(gstin)
        await Promise.all([writeCache(env, gstin, lookup), incrementDailyCount(env)])
      } catch (error) {
        lookupError =
          error instanceof LookupError
            ? error.message
            : 'The verification service could not be reached.'
      }
    }
  }

  const assessment = assessRisk({
    validation,
    lookup,
    lookupError,
    expectedName,
    expectedStateCode,
    now: new Date(),
  })

  return json({
    assessment,
    record: lookup?.found ? lookup.record : null,
    diagnostics: lookup?.diagnostics ?? null,
  })
}

function resolveProvider(env: Env): LookupProvider {
  const provider = env.GST_PROVIDER ?? 'mock'
  if (provider === 'mock') return new MockLookupProvider()

  if (!env.GST_API_KEY) {
    throw new LookupError(`Provider "${provider}" is selected but GST_API_KEY is not set.`, 'config')
  }

  switch (provider) {
    case 'appyflow':
      return new AppyflowProvider(env.GST_API_KEY)
    case 'gstincheck':
      return new GstinCheckProvider(env.GST_API_KEY)
    default:
      throw new LookupError(`Unknown GST_PROVIDER "${provider}".`, 'config')
  }
}

/* ---------- KV cache: registry data is stable enough for a 24h TTL ---------- */

async function readCache(env: Env, gstin: string): Promise<LookupOutcome | undefined> {
  if (!env.GST_CACHE) return undefined
  try {
    const raw = await env.GST_CACHE.get(`gstin:${gstin}`, 'json')
    return (raw as LookupOutcome | null) ?? undefined
  } catch {
    return undefined
  }
}

async function writeCache(env: Env, gstin: string, outcome: LookupOutcome): Promise<void> {
  if (!env.GST_CACHE) return
  try {
    await env.GST_CACHE.put(`gstin:${gstin}`, JSON.stringify(outcome), {
      expirationTtl: CACHE_TTL_SECONDS,
    })
  } catch {
    /* a cache write failure must not fail the request */
  }
}

/* ---------- Daily spend ceiling: fails closed rather than draining credit ---------- */

function dailyKey(): string {
  return `count:${new Date().toISOString().slice(0, 10)}`
}

async function isOverDailyCap(env: Env): Promise<boolean> {
  if (!env.GST_CACHE) return false
  const cap = Number(env.DAILY_LOOKUP_CAP ?? DEFAULT_DAILY_CAP)
  if (!Number.isFinite(cap) || cap <= 0) return false

  const current = Number((await env.GST_CACHE.get(dailyKey())) ?? '0')
  return current >= cap
}

async function incrementDailyCount(env: Env): Promise<void> {
  if (!env.GST_CACHE) return
  try {
    const key = dailyKey()
    const current = Number((await env.GST_CACHE.get(key)) ?? '0')
    await env.GST_CACHE.put(key, String(current + 1), { expirationTtl: 60 * 60 * 48 })
  } catch {
    /* counter failure must not fail the request */
  }
}
