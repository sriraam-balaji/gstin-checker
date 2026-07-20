import { hasValidSession, json, type Env } from '../_shared.js'

/**
 * Gates every /api/* route except login.
 *
 * AUTH_MODE must be set to "open" explicitly to disable the passphrase. A
 * missing APP_PASSWORD is treated as a misconfiguration, not as permission to
 * serve unauthenticated traffic — failing open by accident on an endpoint that
 * spends money per request is not an acceptable default.
 */
export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env, next } = context
  const path = new URL(request.url).pathname

  if (path === '/api/login') return next()

  if (env.AUTH_MODE === 'open') return next()

  if (!env.APP_PASSWORD || !env.AUTH_SECRET) {
    return json(
      {
        message:
          'Server auth is not configured. Set APP_PASSWORD and AUTH_SECRET, or set AUTH_MODE="open" to run without a passphrase.',
      },
      500,
    )
  }

  if (!(await hasValidSession(request, env))) {
    return json({ message: 'Not signed in.' }, 401)
  }

  return next()
}
