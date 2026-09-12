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
  title: "Aether Dental — Dental Clinic Booking & Management",
  description: "Book dental appointments and manage your clinic with Aether Dental.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="h-full">
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
