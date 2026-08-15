import { PrismaClient } from "./generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";

export * from "./generated/prisma/client.ts";

function createClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  return new PrismaClient({ adapter });
}

/**
 * Standard Next.js dev-mode singleton: without this, every hot-reload of
 * a module that imports this file would open a fresh PrismaClient (and a
 * fresh pool of Postgres connections) instead of reusing one, quickly
 * exhausting connections in dev.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
