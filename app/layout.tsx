import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import FeedbackButton from "@/components/ui/FeedbackButton";
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

export const metadata: Metadata = {
  title: "Sport Pool - FIFA World Cup 2026 Prediction Pool",
  description: "Create your FIFA World Cup 2026 prediction pool. Compete with friends, predict match results, and climb the leaderboard.",
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
          } catch(e) {}
        `}} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider>
          <ToastProvider>
            {children}
            <Footer />
            <FeedbackButton />
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
