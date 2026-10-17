import "server-only";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { prisma } from "@/lib/prisma";
import { isGoogleConfigured } from "@/lib/auth-config";
import { emails, sendEmail } from "@/lib/email";
import { LedgerError, createPersonalLedger, prepareAccountDeletion } from "@/lib/ledgers";

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  user: {
    additionalFields: {
      timezone: { type: "string", required: false, input: false },
      budgetAlerts: { type: "boolean", required: false, defaultValue: true, input: false },
    },
    deleteUser: {
      enabled: true,
      beforeDelete: async (user) => {
        try {
          await prepareAccountDeletion(user.id);
        } catch (error) {
          if (error instanceof LedgerError) throw new APIError("BAD_REQUEST", { message: error.message });
          throw error;
        }
      },
    },
  },
  databaseHooks: {
    user: {
      create: {
        // Every account starts with a personal ledger and starter categories.
        after: async (user) => {
          await createPersonalLedger(user.id, user.name);
        },
      },
    },
  },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    autoSignIn: true,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      void sendEmail(emails.resetPassword(user.email, url));
    },
  },
  socialProviders: isGoogleConfigured
    ? {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID!,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          prompt: "select_account",
        },
      }
    : undefined,
  // The Playwright suite signs up many users quickly; it sets this explicitly.
  rateLimit: process.env.AUTH_RATE_LIMIT === "off" ? { enabled: false } : undefined,
  plugins: [nextCookies()], // must stay last
});

export type Session = typeof auth.$Infer.Session;
