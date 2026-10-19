import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign in — Aether Dental",
  description:
    "Staff sign-in for the Aether Dental clinic management system. Visitors can also open the read-only demo dashboard.",
};

export default function LoginPage() {
  // The passwordless demo provider is registered unless DEMO_MODE="false"
  // (see src/auth.ts). Keep the button and the provider gated by the same flag.
  const demoEnabled = process.env.DEMO_MODE !== "false";

  return <LoginForm demoEnabled={demoEnabled} />;
}
