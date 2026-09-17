import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

export class DatabaseConfigurationError extends Error {}

const globalForPrisma = globalThis as typeof globalThis & { nihaoPrisma?: PrismaClient };

export function getPrisma(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new DatabaseConfigurationError("DATABASE_URL no está configurada");
  }

  if (!globalForPrisma.nihaoPrisma) {
    globalForPrisma.nihaoPrisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString }),
    });
  }
  return globalForPrisma.nihaoPrisma;
}
