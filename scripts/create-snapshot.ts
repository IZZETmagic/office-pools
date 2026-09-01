/**
 * BAKE THE REMOTION BUNDLE INTO A SANDBOX SNAPSHOT. Build step.
 *
 * Runs after `next build` on Vercel. It creates a sandbox with Remotion's
 * dependencies, copies this deployment's bundle into it, snapshots the whole
 * machine, and writes the snapshot id to Blob. `restoreSnapshot()` in the render
 * route then boots from that snapshot instead of provisioning from scratch —
 * the difference between a render that starts in seconds and one that
 * npm-installs and downloads a browser first.
 *
 * ⚠ THE KEY IS THE DEPLOYMENT ID, not the project. A snapshot holds the bundle
 * as it was at build time, so it is only valid for the deployment that made it.
 * Keying on `VERCEL_DEPLOYMENT_ID` is what stops a new deployment rendering last
 * week's compositions.
 *
 * ⚠ THIS FAILING FAILS THE DEPLOY, and that is the deliberate half of the
 * trade — Ryan's call, 2026-09-01, choosing baked-in over bundling per request.
 * The alternative was a first render that provisions and bundles from cold. If
 * the coupling ever stops being worth it, the escape is to move this to a
 * post-deploy job and accept that a stale snapshot fails silently instead.
 *
 * ⚠ LOCAL BUILDS SKIP IT. Without the guard, every `npm run build` on a laptop
 * would provision a sandbox and bill for it.
 */

import { readFileSync, existsSync, mkdirSync, rmSync } from 'fs'
import { resolve } from 'path'
import { execSync } from 'child_process'

// .env.local when running by hand; on Vercel the env is already populated.
const envPath = resolve(process.cwd(), '.env.local')
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i === -1) continue
    const k = t.slice(0, i).trim()
    let v = t.slice(i + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (!process.env[k]) process.env[k] = v
  }
}

const FORCED = process.argv.includes('--force')

/** The bundle directory, shared with the render route. */
export const BUNDLE_DIR = '.remotion'

/**
 * ⚠ A TRULY EMPTY PUBLIC DIR, AND "TRULY" IS LOAD-BEARING.
 *
 * Remotion copies the project's `public/` into the bundle so `staticFile()`
 * works. This app's is 1.6MB across nested folders (flags, icons, badges,
 * competitions, .well-known) and NO composition uses any of it — every colour
 * and font here comes from code.
 *
 * ⚠ IT IS NOT MERELY WASTE. `addBundleToSandbox` fails outright on ANY bundle
 * containing a subdirectory:
 *
 *     cannot create directory '/vercel/sandbox/remotion-bundle/public':
 *     No such file or directory
 *
 * Its `collectBundleDirectories` derives directories from the ancestors of FILE
 * paths, so the root `remotion-bundle/` — which is nobody's ancestor — is never
 * created, and the first `mkDir` of a subdirectory therefore fails. The upstream
 * template only works because its bundle happens to be flat.
 *
 * So the directory must contain NOTHING, not even a `.gitkeep`: one tracked
 * placeholder file is enough to produce a `public/` ancestor and bring the whole
 * failure back. It is therefore created here at build time rather than
 * committed, which is also the only way to guarantee it stays empty.
 *
 * If a composition ever genuinely needs a static asset, this stops being viable
 * and the upstream bug has to be worked around properly.
 */
export const PUBLIC_DIR = '.remotion-public'

/** Where the snapshot id for THIS deployment lives. */
export function snapshotBlobKey(): string {
  return `snapshot-cache/${process.env.VERCEL_DEPLOYMENT_ID ?? 'local'}.json`
}

export function bundleRemotionProject(bundleDir: string): void {
  // Recreated each run, so a stray file can never sneak in. See PUBLIC_DIR.
  rmSync(PUBLIC_DIR, { recursive: true, force: true })
  mkdirSync(PUBLIC_DIR, { recursive: true })
  try {
    execSync(`node_modules/.bin/remotion bundle --out-dir ./${bundleDir} --public-dir ./${PUBLIC_DIR}`, {
      cwd: process.cwd(),
      stdio: 'inherit',
    })
  } catch (e) {
    const stderr = (e as { stderr?: Buffer }).stderr?.toString() ?? ''
    throw new Error(`Remotion bundle failed: ${stderr}`)
  }
}

async function main() {
  if (!process.env.VERCEL && !FORCED) {
    console.log('[create-snapshot] not on Vercel — skipping. Pass --force to run anyway.')
    return
  }

  const blobToken = process.env.BLOB_READ_WRITE_TOKEN
  if (!blobToken) {
    throw new Error(
      'BLOB_READ_WRITE_TOKEN is not set. The `sportpool-media` Blob store should ' +
        'supply it on all environments — check it is still linked to the project.',
    )
  }

  const { put } = await import('@vercel/blob')
  const { addBundleToSandbox, createSandbox } = await import('@remotion/vercel')

  console.log('[create-snapshot] creating sandbox…')
  const sandbox = await createSandbox({
    onProgress: ({ progress, message }: { progress: number; message: string }) => {
      console.log(`[create-snapshot] ${message} (${Math.round(progress * 100)}%)`)
    },
  })

  try {
    console.log('[create-snapshot] bundling compositions…')
    bundleRemotionProject(BUNDLE_DIR)
    await addBundleToSandbox({ sandbox, bundleDir: BUNDLE_DIR })

    console.log('[create-snapshot] snapshotting…')
    // `expiration: 0` — never expires. The key is the deployment id, so a stale
    // snapshot is unreachable rather than wrong; letting them expire would make
    // an old-but-live deployment stop rendering.
    const { snapshotId } = await sandbox.snapshot({ expiration: 0 })

    await put(snapshotBlobKey(), JSON.stringify({ snapshotId }), {
      access: 'public',
      contentType: 'application/json',
      addRandomSuffix: false,
      token: blobToken,
    })
    console.log(`[create-snapshot] saved ${snapshotId} at ${snapshotBlobKey()}`)
  } finally {
    await sandbox?.stop().catch(() => {})
  }
}

main().catch((e) => {
  console.error('[create-snapshot]', e instanceof Error ? e.message : e)
  process.exit(1)
})
