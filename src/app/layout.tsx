import { TrackingPixels } from "@/components/tracking-pixels";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import "./globals.css";

/**
 * The root layout must render <html> and <body>: pages outside `[locale]`
 * (`/store`, `/shop/[slug]`, `/invoice/[number]`, `/directory`) have no other
 * layout above them, and without these tags the app renders unstyled with a
 * runtime error.
 *
 * The locale pages need `lang` to follow the active locale, and a nested layout
 * cannot change the root's <html> attributes. Those pages therefore set `lang`
 * themselves via `[locale]/layout.tsx`… which is not possible either, so the
 * locale is carried on <body> and the html element keeps a neutral default —
 * see the note in `[locale]/layout.tsx`.
 */
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

/**
 * Mobile-first (Boss spec: 90% merchants on phones). Without an explicit
 * viewport the layout viewport stays at ~980px on phones, which is what
 * produces horizontal scrolling and tiny text on real devices.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "JutaOne.Biz",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`dark ${inter.variable}`}>
      <body className="min-h-dvh bg-ink font-sans antialiased">
        <TrackingPixels />
        {children}
      </body>
    </html>
  );
}
