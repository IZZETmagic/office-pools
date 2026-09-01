// =============================================================
// REMOTION RENDER CONFIG
// =============================================================
// ⚠ ONLY READ BY THE REMOTION CLI. `next build` never sees this file, and
// nothing in `app/` imports it — it configures `remotion render`, `remotion
// still` and `remotion bundle`, which is why the settings here do not appear
// anywhere in the Next config.
// =============================================================

import { Config } from '@remotion/cli/config'

/**
 * ⚠ REQUIRED FOR WEBGL, which means required for BOTH the 3D corridor
 * (`@remotion/three`) and every `@remotion/effects` effect — they are WebGL2.
 * Headless Chrome defaults to a renderer that has no GPU path, and the symptom
 * is not an error: it is a black or missing canvas in the output file.
 *
 * `angle` is what Remotion's own effects documentation specifies.
 */
Config.setChromiumOpenGlRenderer('angle')
