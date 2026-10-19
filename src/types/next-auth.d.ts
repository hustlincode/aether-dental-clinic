import { DefaultSession } from "next-auth";
import { DefaultJWT } from "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
      /** True for the public read-only showcase session (see src/auth.ts). */
      isDemo?: boolean;
    } & DefaultSession["user"];
  }

  interface User {
    id: string;
    role: string;
    isDemo?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    id?: string;
    role?: string;
    isDemo?: boolean;
  }
}
