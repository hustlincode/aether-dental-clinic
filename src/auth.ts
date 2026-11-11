import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { isDemoEnabled, isDemoEmail, refreshAuthToken } from "@/lib/auth-policy";
import { getRequestTenant } from "@/lib/tenant";
import { assertTenantAuthEnvironment } from "@/lib/tenant-host";

assertTenantAuthEnvironment();

const credentialsSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

/**
 * Public read-only demo access.
 *
 * The "demo" provider is passwordless on purpose: it exists so visitors of the
 * live portfolio can open the staff dashboard without knowing any credential.
 * Every session it creates is flagged `isDemo`, and the API layer rejects all
 * mutating requests from demo sessions (see `requireWriteAuth` in lib/api.ts).
 *
 * Both DEMO_MODE="true" and DEMO_TENANT_SLUG opt one isolated showcase
 * clinic into the provider. Real clinic tenants never inherit showcase access.
 */
const DEFAULT_DEMO_EMAIL = "demo@aetherdental.ph";
const demoEmail = (process.env.DEMO_EMAIL || DEFAULT_DEMO_EMAIL).toLowerCase();
const demoEnabled = isDemoEnabled();

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  // proxy.ts validates the clinic host and replaces forwarded origin headers
  // before Auth.js builds any action or callback URLs.
  trustHost: true,
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;

        const tenant = await getRequestTenant();
        const user = await prisma.user.findFirst({ where: { email: email.toLowerCase(), tenantId: tenant.id } });
        if (!user || !user.active) return null;

        const isValid = await bcrypt.compare(password, user.passwordHash);
        if (!isValid) return null;

        return {
          id: user.id,
          tenantId: tenant.id,
          name: user.name,
          email: user.email,
          role: user.role,
          sessionVersion: user.sessionVersion,
          // Even if the demo account's password ever becomes known, a session
          // opened with it must never gain write access.
          isDemo: isDemoEmail(user.email),
        };
      },
    }),
    ...(demoEnabled
      ? [
          Credentials({
            id: "demo",
            name: "Demo access",
            credentials: {},
            async authorize() {
              const tenant = await getRequestTenant();
              if (tenant.slug !== process.env.DEMO_TENANT_SLUG) return null;
              const demoUser = await prisma.user.findFirst({ where: { email: demoEmail, tenantId: tenant.id } });

              if (!demoUser || !demoUser.active) return null;

              return {
                id: demoUser.id,
                tenantId: tenant.id,
                name: "Demo visitor",
                email: demoUser.email,
                role: demoUser.role,
                sessionVersion: demoUser.sessionVersion,
                isDemo: true,
              };
            },
          }),
        ]
      : []),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.tenantId = user.tenantId;
        token.isDemo = user.isDemo === true;
        token.sessionVersion = user.sessionVersion;
      }
      return refreshAuthToken(token);
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.tenantId = token.tenantId as string;
        session.user.role = token.role as string;
        session.user.name = token.name;
        session.user.email = token.email as string;
        session.user.isDemo = token.isDemo === true;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
});
