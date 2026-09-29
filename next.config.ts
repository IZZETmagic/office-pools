import type { NextConfig } from "next";

// Baseline hardening headers — safe on every route (they don't affect framing).
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

// Clickjacking protection. Applied to everything EXCEPT /tv/* — the branded TV
// leaderboard boards are meant to be embedded (digital signage / iframe) on
// external displays, so a blanket frame-deny would break them.
const frameProtectionHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
];

const nextConfig: NextConfig = {
  // ⚠ DELIBERATELY PUBLIC. KLIPY (Banter GIFs) requires its API to be called from the
  // browser, never from our server, so its key ships in the client bundle — KLIPY treats it
  // as public. Vercel refuses a NEXT_PUBLIC_ name containing "KEY", so the variable is
  // NEXT_KLIPY_API_KEY and this maps it in. `env` is Next's legacy mechanism but documented
  // and supported in 16; values are inlined at BUILD time, so changing the key needs a redeploy.
  env: {
    KLIPY_WEB_KEY: process.env.NEXT_KLIPY_API_KEY ?? "",
  },
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.sportpool.io" }],
        destination: "https://sportpool.io/:path*",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        // Match all paths except those under /tv/ (embeddable boards).
        source: "/((?!tv/).*)",
        headers: frameProtectionHeaders,
      },
      {
        // ⭐ The avatar art — 564 KB raw, ~169 KB gzipped — fetched by every member who opens
        // the avatar builder. Next serves public/ with `max-age=0`, which means a revalidation
        // round trip on every page view. That was fine while one admin was the only reader.
        //
        // ⚠⚠ IT CANNOT BE `immutable` ON THIS PATH. The url never changes when the bundle is
        // rebuilt, so `immutable` would serve the old art until the cache expired — a member
        // would see a hairstyle that no longer exists and no deploy could fix it. A
        // content-hashed filename is the durable answer; until then this is the honest
        // setting: at worst one round trip an hour, and never stale for long.
        source: "/avatar-assets.json",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=3600, stale-while-revalidate=86400",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
