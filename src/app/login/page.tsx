import type { Metadata } from "next";
import { LoginForm } from "./login-form";
import { isDemoEnabled } from "@/lib/auth-policy";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign in — Aether Dental",
  description:
    "Staff sign-in for the Aether Dental clinic management system. Visitors can also open the read-only demo dashboard.",
};

export default function LoginPage() {
  return <LoginForm demoEnabled={isDemoEnabled()} />;
}
