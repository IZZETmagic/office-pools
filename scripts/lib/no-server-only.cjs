// =============================================================
// Resolve `server-only` to nothing, for hand-run scripts.
// =============================================================
// `lib/league/season.ts` imports `server-only`, which THROWS the moment it is
// loaded outside a Next.js server bundle — so any script that reaches the
// league sync arm dies at import time, before a line of it runs. The cache
// invalidation that guard protects is a no-op here anyway (revalidateTag has
// no store outside Next, and the helper swallows that).
//
// Must be the FIRST import of the script: tsx keeps ESM import order, and the
// hook has to be in place before the module that imports `server-only` loads.
//
//   import './lib/no-server-only.cjs'
// =============================================================
const Module = require('module')
const path = require('path')
const orig = Module._resolveFilename
Module._resolveFilename = function (request, ...rest) {
  if (request === 'server-only') return path.join(__dirname, 'empty.cjs')
  return orig.call(this, request, ...rest)
}
