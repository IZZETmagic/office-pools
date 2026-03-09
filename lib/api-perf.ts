import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

type RouteHandler = (
  request: NextRequest,
  context?: any
) => Promise<NextResponse>

/**
 * Wraps an API route handler to log performance metrics.
 * Logs are fire-and-forget to avoid impacting response times.
 */
export function withPerfLogging(
  endpoint: string,
  handler: RouteHandler
): RouteHandler {
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
