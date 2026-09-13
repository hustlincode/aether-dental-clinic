import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/ui/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://aetherdental.ph"),
  title: "Aether Dental — Book Your Dental Appointment Online | Taguig, Metro Manila",
  description:
    "Book your dental appointment online at Aether Dental in Taguig, Metro Manila. See clear service prices, choose a dentist, and get an instant email confirmation — no phone calls needed.",
  openGraph: {
    type: "website",
    locale: "en_PH",
    siteName: "Aether Dental",
    title: "Aether Dental — Book Your Dental Appointment Online | Taguig, Metro Manila",
    description:
      "Book your dental appointment online at Aether Dental in Taguig, Metro Manila. Clear prices, real availability, instant confirmation.",
    url: "/",
    images: [
      {
        url: "/og.svg",
        width: 1200,
        height: 630,
        alt: "Aether Dental — Book your dental appointment online",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Aether Dental — Book Your Dental Appointment Online | Taguig, Metro Manila",
    description:
      "Book your dental appointment online at Aether Dental in Taguig, Metro Manila. Clear prices, real availability, instant confirmation.",
    images: ["/og.svg"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="h-full" suppressHydrationWarning>
        {/* External (not inline) so React never renders a script element.
            beforeInteractive injects it before hydration to avoid a theme flash. */}
        <Script id="theme-script" src="/theme-init.js" strategy="beforeInteractive" />
        <ThemeProvider>
          <TooltipProvider delayDuration={0}>
            {children}
          </TooltipProvider>
          <Toaster position="bottom-right" richColors />
        </ThemeProvider>
      </body>
    </html>
  );
}
