import { betterAuth, APIError } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { getDb } from "@/db";
import * as schema from "@/db/schema";

export const requiredSettings = [
  "DATABASE_URL",
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
  "GITHUB_CLIENT_ID",
  "GITHUB_CLIENT_SECRET",
  "AUTH_ALLOWED_EMAIL",
  "CRON_SECRET",
] as const;
export function missingSettings() {
  return requiredSettings.filter((key) => !process.env[key]);
}
export function authConfigured() {
  return requiredSettings
    .filter((key) => key !== "CRON_SECRET")
    .every((key) => Boolean(process.env[key]));
}
export function localPreview() {
  return process.env.NODE_ENV !== "production" && !process.env.VERCEL && !authConfigured();
}
export function allowedEmail(email: string) {
  return (
    Boolean(process.env.AUTH_ALLOWED_EMAIL) &&
    email.toLowerCase() === process.env.AUTH_ALLOWED_EMAIL!.trim().toLowerCase()
  );
}
function createAuth() {
  return betterAuth({
    appName: "Siggo",
    baseURL: process.env.BETTER_AUTH_URL!,
    secret: process.env.BETTER_AUTH_SECRET!,
    database: drizzleAdapter(getDb(), { provider: "pg", schema }),
    socialProviders: {
      github: {
        clientId: process.env.GITHUB_CLIENT_ID!,
        clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (newUser) => {
            if (!allowedEmail(newUser.email))
              throw new APIError("FORBIDDEN", { message: "This is a private workspace." });
            return { data: newUser };
          },
        },
      },
    },
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
  });
}
let auth: ReturnType<typeof createAuth> | undefined;
export function getAuth() {
  if (!authConfigured()) throw new Error("Authentication is not configured");
  auth ??= createAuth();
  return auth;
}
