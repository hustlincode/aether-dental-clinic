import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
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

        // NextAuth authorize() return type doesn't include `role` — cast is intentional.
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        } as any; // eslint-disable-line @typescript-eslint/no-explicit-any -- NextAuth authorize() return type is not augmented for custom fields
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = (user as any).id; // eslint-disable-line @typescript-eslint/no-explicit-any -- NextAuth JWT callback typed as generic User
        token.role = (user as any).role; // eslint-disable-line @typescript-eslint/no-explicit-any -- NextAuth JWT callback typed as generic User
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id as string; // eslint-disable-line @typescript-eslint/no-explicit-any -- Augmenting session with custom JWT fields
        (session.user as any).role = token.role as string; // eslint-disable-line @typescript-eslint/no-explicit-any -- Augmenting session with custom JWT fields
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
});
