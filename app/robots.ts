import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://sportpool.io";

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin/", "/dashboard", "/profile", "/api/", "/reset-password", "/forgot-password", "/account-deleted"],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
