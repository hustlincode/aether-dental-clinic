import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/ui/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getRequestTenant } from "@/lib/tenant";
import { TenantBrandProvider } from "@/components/brand/tenant-brand";
import { subscriptionAccess } from "@/lib/subscription";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const tenant = await getRequestTenant();
  const title = `${tenant.name} - Book Your Dental Appointment Online`;
  const description = `Request your dental appointment online at ${tenant.name}. See service prices, choose a dentist, and receive confirmation from clinic staff.`;
  return {
    title,
    description,
    openGraph: { type: "website", locale: "en_PH", siteName: tenant.name, title, description },
    twitter: { card: "summary", title, description },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const tenant = await getRequestTenant();
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
        <TenantBrandProvider name={tenant.name} bookingAllowed={subscriptionAccess(tenant).canWrite}>
          <ThemeProvider>
            <TooltipProvider delayDuration={0}>
              {children}
            </TooltipProvider>
            <Toaster position="bottom-right" richColors />
          </ThemeProvider>
        </TenantBrandProvider>
      </body>
    </html>
  );
}
