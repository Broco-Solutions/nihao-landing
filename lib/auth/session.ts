import { headers } from "next/headers";
import { BetterAuthConfigurationError, getAuth } from "./auth";
import { DatabaseConfigurationError } from "./prisma";
import { AuthConfigurationError, AuthenticationRequiredError } from "./errors";

export { AuthConfigurationError, AuthenticationRequiredError } from "./errors";

export type AuthenticatedUser = { id: string; email: string; name: string };

export async function getAuthenticatedUser(): Promise<AuthenticatedUser> {
  try {
    const session = await getAuth().api.getSession({ headers: await headers() });
    if (!session) throw new AuthenticationRequiredError("Tenés que iniciar sesión");
    return { id: session.user.id, email: session.user.email, name: session.user.name };
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) throw error;
    if (error instanceof BetterAuthConfigurationError || error instanceof DatabaseConfigurationError) {
      throw new AuthConfigurationError("La autenticación productiva todavía no está configurada");
    }
    throw error;
  }
}
