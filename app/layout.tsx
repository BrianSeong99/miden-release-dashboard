import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });
const title = "Miden Release Dashboard";
const description = "Where is the next Miden release across the dependency chain?";
const siteUrl = "https://brianseong99.github.io/miden-release-dashboard/";
const shareImage = {
  url: "https://brianseong99.github.io/miden-release-dashboard/og-image.png",
  width: 1200,
  height: 630,
  type: "image/png",
  alt: "Miden Release Dashboard — release readiness and dependencies across the Miden ecosystem",
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title,
  description,
  alternates: { canonical: siteUrl },
  openGraph: {
    title,
    description,
    siteName: title,
    url: siteUrl,
    type: "website",
    locale: "en_US",
    images: [shareImage],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [{ url: shareImage.url, alt: shareImage.alt }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
