import type { Metadata, Viewport } from "next";
import { Fraunces, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

// Display serif for titles — soft, warm, friendly "fancy".
const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  axes: ["SOFT", "opsz"],
  display: "swap",
});

// Friendly geometric sans for body / smaller text.
const sans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_BASE_URL ?? "https://soundnt-app.vercel.app"
  ),
  title: {
    default: "soundn't — local AI mic noise suppression",
    template: "%s · soundn't",
  },
  description:
    "Real-time AI microphone noise suppression that runs entirely on your machine. No account, no cloud. Go Pro with crypto.",
  openGraph: {
    title: "soundn't — local AI mic noise suppression",
    description:
      "Real-time AI microphone noise suppression that runs entirely on your machine. No account, no cloud.",
    type: "website",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#f4eedb",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable}`}>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
