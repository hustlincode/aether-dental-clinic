import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { isDemoEnabled, isDemoEmail, refreshAuthToken } from "@/lib/auth-policy";

const credentialsSchema = z.object({
  email: z.string().email(),
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
 * Explicit DEMO_MODE="true" enables the provider, including in production.
 * Disabling it also rejects existing demo sessions.
 */
const DEFAULT_DEMO_EMAIL = "demo@aetherdental.ph";
const demoEmail = (process.env.DEMO_EMAIL || DEFAULT_DEMO_EMAIL).toLowerCase();
const demoEnabled = isDemoEnabled();

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  // Required when self-hosting outside Vercel (and behind the standard reverse
  // proxy that sets the Host header). Without it Auth.js rejects requests with
  // UntrustedHost on any non-Vercel production deployment.
  // See https://errors.authjs.dev#untrustedhost
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

        const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
        if (!user || !user.active) return null;

        const isValid = await bcrypt.compare(password, user.passwordHash);
        if (!isValid) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
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
              // Prefer the dedicated demo account. The fallback keeps the demo
              // button working on deployments seeded before it existed, without
              // touching the database schema.
              const demoUser =
                (await prisma.user.findUnique({ where: { email: demoEmail } })) ??
                (await prisma.user.findUnique({ where: { email: DEFAULT_DEMO_EMAIL } })) ??
                (await prisma.user.findUnique({ where: { email: "admin@aetherdental.ph" } }));

              if (!demoUser || !demoUser.active) return null;

              return {
                id: demoUser.id,
                name: "Demo visitor",
                email: demoUser.email,
                role: demoUser.role,
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
        token.isDemo = user.isDemo === true;
      }
      return refreshAuthToken(token);
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
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
