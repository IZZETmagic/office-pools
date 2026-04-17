import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// Next.js 15/16 passes `{ params: Promise<...> }` as the second argument to
// dynamic route handlers. Generic over the params shape so each route keeps
// its precise segment typing through the wrapper.
type RouteContext<P extends Record<string, string> = Record<string, string>> = {
  params: Promise<P>
}

type RouteHandler<P extends Record<string, string> = Record<string, string>> = (
  request: NextRequest,
  context: RouteContext<P>
) => Promise<NextResponse>

/**
 * Wraps an API route handler to log performance metrics.
 * Logs are fire-and-forget to avoid impacting response times.
 */
export function withPerfLogging<P extends Record<string, string>>(
  endpoint: string,
  handler: RouteHandler<P>
): RouteHandler<P> {
  return async (request, context) => {
    const start = performance.now()
    let statusCode = 200

    try {
      const response = await handler(request, context)
      statusCode = response.status
      return response
    } catch (err) {
      statusCode = 500
      throw err
    } finally {
      const responseTimeMs = Math.round(performance.now() - start)
      logPerfEntry(endpoint, request.method, statusCode, responseTimeMs).catch(() => {})
    }
  }
}

async function logPerfEntry(
  endpoint: string,
  method: string,
  statusCode: number,
  responseTimeMs: number
) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    let userId: string | null = null
    if (user) {
      const { data } = await supabase
        .from('users')
        .select('user_id')
        .eq('auth_user_id', user.id)
        .single()
      userId = data?.user_id ?? null
    }

    await supabase.from('api_perf_log').insert({
      endpoint,
      method,
      status_code: statusCode,
      response_time_ms: responseTimeMs,
      user_id: userId,
    })
  } catch {
    // Silently ignore - perf logging should never break API responses
  }
}
