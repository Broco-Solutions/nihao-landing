import { prismaAdapter } from "@better-auth/prisma-adapter";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { getPrisma } from "./prisma";
import { sendPasswordResetEmail } from "./password-reset-email";

export class BetterAuthConfigurationError extends Error {}

function createConfiguredAuth() {
  const secret = process.env.BETTER_AUTH_SECRET;
  const baseURL = process.env.BETTER_AUTH_URL;
  if (!secret || secret.length < 32 || !baseURL) {
    throw new BetterAuthConfigurationError("BETTER_AUTH_SECRET y BETTER_AUTH_URL deben estar configuradas");
  }

  const trustedOrigins = (process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? process.env.CORS_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const publicAppUrl = process.env.PUBLIC_APP_URL?.trim();
  if (publicAppUrl && !trustedOrigins.includes(publicAppUrl)) trustedOrigins.push(publicAppUrl);
  const cookieDomain = process.env.BETTER_AUTH_COOKIE_DOMAIN?.trim();

  return betterAuth({
    baseURL,
    secret,
    database: prismaAdapter(getPrisma(), { provider: "postgresql" }),
    emailAndPassword: {
      enabled: true,
      sendResetPassword: async ({ user, url }) => sendPasswordResetEmail({ recipientEmail: user.email, resetUrl: url }),
    },
    trustedOrigins,
    advanced: cookieDomain
      ? { crossSubDomainCookies: { enabled: true, domain: cookieDomain } }
      : undefined,
    plugins: [nextCookies()],
  });
}

let configuredAuth: ReturnType<typeof createConfiguredAuth> | undefined;

export function getAuth() {
  if (configuredAuth) return configuredAuth;
  const auth = createConfiguredAuth();
  configuredAuth = auth;
  return auth;
}
