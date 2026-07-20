export interface Env {
  /** Passphrase that gates the whole app. */
  APP_PASSWORD?: string
  /** Signing key for the session cookie. */
  AUTH_SECRET?: string
  /** 'mock' (default) or 'appyflow'. */
  GST_PROVIDER?: string
  /** Provider API key. Never exposed to the browser. */
  GST_API_KEY?: string
  /** Hard ceiling on paid lookups per UTC day. Fails closed when reached. */
  DAILY_LOOKUP_CAP?: string
  GST_CACHE?: KVNamespace
}

export const SESSION_COOKIE = 'gst_session'

export function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  })
}

/** Comparison whose duration does not depend on where the first difference is. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

export async function signToken(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value))
  return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get('Cookie')
  if (!header) return undefined

  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) return rest.join('=')
  }
  return undefined
}

export async function hasValidSession(request: Request, env: Env): Promise<boolean> {
  if (!env.APP_PASSWORD || !env.AUTH_SECRET) return false

  const cookie = readCookie(request, SESSION_COOKIE)
  if (!cookie) return false

  const expected = await signToken(env.APP_PASSWORD, env.AUTH_SECRET)
  return timingSafeEqual(cookie, expected)
}
