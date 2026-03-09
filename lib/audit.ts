export async function logAuditEvent(params: {
  action: string
  match_id?: string
  target_user_id?: string
  pool_id?: string
  details?: Record<string, any>
  summary?: string
}) {
  try {
    await fetch('/api/admin/audit-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })
  } catch (e) {
    console.error('[Audit] Failed to log event:', e)
  }
}
