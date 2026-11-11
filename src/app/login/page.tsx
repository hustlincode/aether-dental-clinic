import type { Metadata } from "next";
import { LoginForm } from "./login-form";
import { isDemoEnabled } from "@/lib/auth-policy";
import { getRequestTenant } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const tenant = await getRequestTenant();
  return { title: `Sign in - ${tenant.name}`, description: `Staff sign-in for ${tenant.name}.` };
}

export default async function LoginPage() {
  const tenant = await getRequestTenant();
  const demoEnabled = isDemoEnabled() && process.env.DEMO_TENANT_SLUG === tenant.slug;
  return <LoginForm demoEnabled={demoEnabled} />;
}
