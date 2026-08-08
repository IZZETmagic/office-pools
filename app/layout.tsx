import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Nunito } from "next/font/google";
import { GoogleTagManager } from "@next/third-parties/google";
import "./globals.css";
import Footer from "@/components/ui/Footer";

import { ToastProvider } from "@/components/ui/Toast";
import { ThemeProvider } from "@/components/ThemeProvider";
import { PresenceProvider } from "@/components/presence/PresenceProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  // palette.primary from mobile/theme/colors.ts. Keep in step with `theme_color` in
  // public/manifest.json — these two paint the PWA/browser chrome.
  themeColor: "#3B6EFF",
  viewportFit: "cover",
  // Resize the layout when the on-screen keyboard appears, rather than letting
  // the browser overlay it and pan the visual viewport. Without this, focusing
  // the banter composer scrolled the pool header and tab strip out of view and
  // did not bring them back. Chrome/Android honours it directly; iOS Safari
  // still pans, which CommunityTab compensates for by offsetTop.
  interactiveWidget: "resizes-content",
};

export const metadata: Metadata = {
  metadataBase: new URL("https://sportpool.io"),
  title: {
    default: "SportPool - FIFA World Cup 2026 Prediction Pool",
    template: "%s | SportPool",
  },
  description: "Create your FIFA World Cup 2026 prediction pool. Compete with friends, predict match results, and climb the leaderboard.",
  manifest: "/manifest.json",
  icons: {
    icon: "/icons/icon-192x192.png",
    apple: "/icons/icon-192x192.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "SportPool",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://sportpool.io",
    siteName: "SportPool",
    title: "SportPool - FIFA World Cup 2026 Prediction Pool",
    description: "Create your FIFA World Cup 2026 prediction pool. Compete with friends, predict match results, and climb the leaderboard.",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "SportPool - FIFA World Cup 2026 Prediction Pool" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "SportPool - FIFA World Cup 2026 Prediction Pool",
    description: "Create your FIFA World Cup 2026 prediction pool. Compete with friends, predict match results, and climb the leaderboard.",
    images: ["/og-image.png"],
  },
  verification: {
    google: "googlebbdfb25f2108115e",
  },
  keywords: ["FIFA World Cup 2026", "prediction pool", "World Cup pool", "soccer predictions", "football predictions", "World Cup 2026 bracket", "free prediction pool"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Prevent flash-of-wrong-theme by reading localStorage before first paint */}
        <script dangerouslySetInnerHTML={{ __html: `
          try {
            var cm = localStorage.getItem('sport-pool-color-mode');
            if (cm === 'dark' || (cm !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
              document.documentElement.classList.add('dark');
            }
          } catch(e) {}
        `}} />
      </head>
      {process.env.NEXT_PUBLIC_GTM_ID && (
        <GoogleTagManager gtmId={process.env.NEXT_PUBLIC_GTM_ID} />
      )}
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${nunito.variable} antialiased`}
      >
        <ThemeProvider>
          <ToastProvider>
            {/* App-wide presence: no-ops for anonymous visitors (local
                session check only — no network), so it's safe on
                marketing pages too. */}
            <PresenceProvider>
              {children}
              <Footer />
            </PresenceProvider>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
