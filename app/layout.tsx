import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { GoogleTagManager } from "@next/third-parties/google";
import "./globals.css";
import Footer from "@/components/ui/Footer";

import { ToastProvider } from "@/components/ui/Toast";
import { ThemeProvider } from "@/components/ThemeProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  themeColor: "#3b5bdb",
  viewportFit: "cover",
};

export const metadata: Metadata = {
  metadataBase: new URL("https://sportpool.io"),
  title: {
    default: "Sport Pool - FIFA World Cup 2026 Prediction Pool",
    template: "%s | Sport Pool",
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
    title: "Sport Pool",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://sportpool.io",
    siteName: "Sport Pool",
    title: "Sport Pool - FIFA World Cup 2026 Prediction Pool",
    description: "Create your FIFA World Cup 2026 prediction pool. Compete with friends, predict match results, and climb the leaderboard.",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Sport Pool - FIFA World Cup 2026 Prediction Pool" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Sport Pool - FIFA World Cup 2026 Prediction Pool",
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
            if (localStorage.getItem('sport-pool-theme') === 'classic') {
              document.documentElement.classList.add('theme-classic');
            }
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
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider>
          <ToastProvider>
            {children}
            <Footer />
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
