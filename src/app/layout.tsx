import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Archivo_Black } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/app-shell";
import { getSiteUrl } from "@/lib/site-url";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const archivoBlack = Archivo_Black({
  weight: "400",
  variable: "--font-display",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: getSiteUrl(),
  title: {
    default: "blood against blackout — find a meeting",
    template: "%s | blood against blackout",
  },
  description:
    "Find A.A., N.A., and C.A. meetings near you. Independent, privacy-first, and not affiliated with World Services offices.",
  alternates: { canonical: "/" },
  applicationName: "blood against blackout",
  keywords: ["AA meetings", "NA meetings", "CA meetings", "recovery meetings"],
  openGraph: {
    type: "website",
    title: "blood against blackout",
    description: "darkness dies at the door. find a meeting near you.",
    siteName: "blood against blackout",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "blood against blackout",
    description: "darkness dies at the door. find a meeting near you.",
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "blood against blackout",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#140018",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`dark ${geistSans.variable} ${geistMono.variable} ${archivoBlack.variable}`}
    >
      <body className="min-h-dvh bg-background text-foreground antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
