import { json, signToken, timingSafeEqual, SESSION_COOKIE, type Env } from '../_shared.js'

const SESSION_MAX_AGE = 60 * 60 * 24 * 30

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.APP_PASSWORD || !env.AUTH_SECRET) {
    return json({ message: 'Server auth is not configured.' }, 500)
  }

  let password: string
  try {
    const body = (await request.json()) as { password?: string }
    password = String(body.password ?? '')
  } catch {
    return json({ message: 'Malformed request.' }, 400)
  }

  if (!timingSafeEqual(password, env.APP_PASSWORD)) {
    // Blunt the brute-force rate without leaking whether the length was right.
    await new Promise((resolve) => setTimeout(resolve, 400))
    return json({ message: 'Incorrect passphrase.' }, 401)
  }

  const token = await signToken(env.APP_PASSWORD, env.AUTH_SECRET)
  const cookie = [
    `${SESSION_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
    `Max-Age=${SESSION_MAX_AGE}`,
  ].join('; ')

  return json({ ok: true }, 200, { 'Set-Cookie': cookie })
}
