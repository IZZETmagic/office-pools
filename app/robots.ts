import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://sportpool.io";

  // Preview builds (dev.sportpool.io) run real content against the real
  // database. Keeping a private tester build out of the index is half of
  // "not the entire public" — the tester gate is the other half.
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") {
    return {
      rules: { userAgent: "*", disallow: "/" },
    };
  }

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin/", "/dashboard", "/profile", "/api/", "/reset-password", "/forgot-password", "/account-deleted"],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
