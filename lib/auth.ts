import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

type AuthResult = {
  supabase: Awaited<ReturnType<typeof createClient>>
  user: { id: string; email?: string }
  userData: { user_id: string; is_super_admin?: boolean }
}

type AuthError = NextResponse

/**
 * Authenticate the current request (cookie or Bearer token — handled by createClient).
 * Returns the Supabase client, auth user, and app user row.
 */
export async function requireAuth(): Promise<
  { data: AuthResult; error: null } | { data: null; error: AuthError }
> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { data: null, error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const { data: userData } = await supabase
    .from('users')
    .select('user_id, is_super_admin')
    .eq('auth_user_id', user.id)
    .single()

  if (!userData) {
    return { data: null, error: NextResponse.json({ error: 'User not found' }, { status: 404 }) }
  }

  return { data: { supabase, user, userData }, error: null }
}

/**
 * Authenticate and verify the user is a super admin.
 */
export async function requireSuperAdmin(): Promise<
  { data: AuthResult; error: null } | { data: null; error: AuthError }
> {
  const result = await requireAuth()
  if (result.error) return result

  if (!result.data.userData.is_super_admin) {
    return {
      data: null,
      error: NextResponse.json({ error: 'Super admin required' }, { status: 403 }),
    }
  }

  return result
}
