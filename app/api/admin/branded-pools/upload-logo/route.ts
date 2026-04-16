import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp']
const MAX_SIZE = 2 * 1024 * 1024 // 2MB

export async function POST(request: NextRequest) {
  const auth = await requireSuperAdmin()
  if (auth.error) return auth.error

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  const slug = formData.get('slug') as string | null
  const oldUrl = formData.get('old_url') as string | null

  if (!file) {
    return NextResponse.json({ error: 'No file provided.' }, { status: 400 })
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'Only PNG, JPEG, and WebP images are allowed.' }, { status: 400 })
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'File must be under 2MB.' }, { status: 400 })
  }

  const ext = file.type.split('/')[1] === 'jpeg' ? 'jpg' : file.type.split('/')[1]
  const filename = slug
    ? `${slug}-logo.${ext}`
    : `logo-${Date.now()}.${ext}`

  const adminClient = createAdminClient()

  // Delete old logo if replacing
  if (oldUrl) {
    const oldPath = oldUrl.split('/pool-logos/').pop()
    if (oldPath) {
      await adminClient.storage.from('pool-logos').remove([oldPath])
    }
  }

  const buffer = Buffer.from(await file.arrayBuffer())

  const { error: uploadError } = await adminClient.storage
    .from('pool-logos')
    .upload(filename, buffer, {
      contentType: file.type,
      upsert: true,
    })

  if (uploadError) {
    return NextResponse.json({ error: 'Upload failed: ' + uploadError.message }, { status: 500 })
  }

  const { data: publicUrlData } = adminClient.storage
    .from('pool-logos')
    .getPublicUrl(filename)

  return NextResponse.json({ url: publicUrlData.publicUrl })
}
