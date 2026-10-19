import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";

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
 * `DEMO_MODE="false"` removes the provider entirely (and hides the button on
 * /login). Set it before the deployment ever holds real patient data.
 */
const DEFAULT_DEMO_EMAIL = "demo@aetherdental.ph";
const demoEmail = (process.env.DEMO_EMAIL || DEFAULT_DEMO_EMAIL).toLowerCase();
const demoEnabled = process.env.DEMO_MODE !== "false";

function isDemoEmail(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase() === demoEmail;
}

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

        // NextAuth authorize() return type doesn't include custom fields — cast is intentional.
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          // Even if the demo account's password ever becomes known, a session
          // opened with it must never gain write access.
          isDemo: isDemoEmail(user.email),
        } as any; // eslint-disable-line @typescript-eslint/no-explicit-any -- NextAuth authorize() return type is not augmented for custom fields
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
              } as any; // eslint-disable-line @typescript-eslint/no-explicit-any -- NextAuth authorize() return type is not augmented for custom fields
            },
          }),
        ]
      : []),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = (user as any).id; // eslint-disable-line @typescript-eslint/no-explicit-any -- NextAuth JWT callback typed as generic User
        token.role = (user as any).role; // eslint-disable-line @typescript-eslint/no-explicit-any -- NextAuth JWT callback typed as generic User
        token.isDemo = (user as any).isDemo === true; // eslint-disable-line @typescript-eslint/no-explicit-any -- NextAuth JWT callback typed as generic User
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id as string; // eslint-disable-line @typescript-eslint/no-explicit-any -- Augmenting session with custom JWT fields
        (session.user as any).role = token.role as string; // eslint-disable-line @typescript-eslint/no-explicit-any -- Augmenting session with custom JWT fields
        (session.user as any).isDemo = token.isDemo === true; // eslint-disable-line @typescript-eslint/no-explicit-any -- Augmenting session with custom JWT fields
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
});
