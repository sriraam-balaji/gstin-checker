import { hasValidSession, json, type Env } from '../_shared.js'

/** Gates every /api/* route except login. */
export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env, next } = context
  const path = new URL(request.url).pathname

  if (path === '/api/login') return next()

  if (!env.APP_PASSWORD || !env.AUTH_SECRET) {
    return json(
      { message: 'Server auth is not configured. Set APP_PASSWORD and AUTH_SECRET.' },
      500,
    )
  }

  if (!(await hasValidSession(request, env))) {
    return json({ message: 'Not signed in.' }, 401)
  }

  return next()
}
