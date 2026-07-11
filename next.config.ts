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
    ];
  },
};

export default nextConfig;
