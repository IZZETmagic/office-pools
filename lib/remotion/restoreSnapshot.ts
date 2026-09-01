// =============================================================
// BOOTING A SANDBOX THAT ALREADY HAS THE BUNDLE IN IT
// =============================================================
// The counterpart to scripts/create-snapshot.ts. On Vercel the render does not
// provision a machine and bundle — it restores the snapshot that this
// deployment's build already made, which is the whole reason the build is
// coupled to Sandbox at all.
//
// ⚠ KEYED ON THE DEPLOYMENT, so a snapshot cannot outlive the code it holds. A
// missing snapshot is a loud failure here rather than a silently stale render.
// =============================================================

import { get } from '@vercel/blob'
import { Sandbox } from '@vercel/sandbox'

const BOOT_TIMEOUT_MS = 5 * 60 * 1000

export function snapshotBlobKey(): string {
  return `snapshot-cache/${process.env.VERCEL_DEPLOYMENT_ID ?? 'local'}.json`
}

export async function restoreSnapshot() {
  const key = snapshotBlobKey()
  const blob = await get(key, { access: 'public', token: process.env.BLOB_READ_WRITE_TOKEN })
  if (!blob) {
    throw new Error(
      `No sandbox snapshot at ${key}. It is created by scripts/create-snapshot.ts ` +
        `as part of the Vercel build — check that step ran for this deployment.`,
    )
  }

  const { snapshotId } = (await new Response(blob.stream).json()) as { snapshotId?: string }
  if (!snapshotId) throw new Error(`Snapshot record at ${key} has no snapshotId.`)

  return Sandbox.create({ source: { type: 'snapshot', snapshotId }, timeout: BOOT_TIMEOUT_MS })
}
