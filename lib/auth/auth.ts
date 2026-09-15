import { prismaAdapter } from "@better-auth/prisma-adapter";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { getPrisma } from "./prisma";

export class BetterAuthConfigurationError extends Error {}

function createConfiguredAuth() {
  const secret = process.env.BETTER_AUTH_SECRET;
  const baseURL = process.env.BETTER_AUTH_URL;
  if (!secret || secret.length < 32 || !baseURL) {
    throw new BetterAuthConfigurationError("BETTER_AUTH_SECRET y BETTER_AUTH_URL deben estar configuradas");
  }

  return betterAuth({
    baseURL,
    secret,
    database: prismaAdapter(getPrisma(), { provider: "postgresql" }),
    emailAndPassword: { enabled: true },
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
