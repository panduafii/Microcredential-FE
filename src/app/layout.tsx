import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import AuthGuard from "@/app/_components/AuthGuard";
import AppShell from "@/app/_components/AppShell";
import BfcachePrevention from "@/app/BfcachePrevention";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MicroCred | AI-Powered Assessment",
  description: "Assessment platform with GPT scoring and course recommendations",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {/* Aggressive cache prevention meta tags */}
        <meta httpEquiv="Cache-Control" content="no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0" />
        <meta httpEquiv="Pragma" content="no-cache" />
        <meta httpEquiv="Expires" content="0" />
        <meta httpEquiv="Surrogate-Control" content="no-store" />
        
        {/* Disable browser back/forward cache for security */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              // Prevent bfcache - most aggressive approach
              window.addEventListener('pageshow', function(event) {
                if (event.persisted) {
                  console.log('[Security] Page loaded from bfcache, reloading...');
                  window.location.reload();
                }
              });
              
              // Additional bfcache prevention
              window.addEventListener('beforeunload', function() {
                // Force browser to not cache
              });
              
              // Prevent Firefox bfcache
              window.addEventListener('unload', function() {
                // Just having this listener helps prevent bfcache
              });
            `,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-slate-950 text-slate-50`}
      >
        <BfcachePrevention />
        <AuthGuard>
          <AppShell>{children}</AppShell>
        </AuthGuard>
      </body>
    </html>
  );
}
