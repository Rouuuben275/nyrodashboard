import type { Prisma } from "@prisma/client";

export type Limits = { companies: number; employees: number; servers: number };
// Ownership capacity is enforced by Discord entitlements, independently of Plan JSON.
const defaults: Limits = { companies: 1, employees: 50, servers: 10 };
export function readLimits(value: Prisma.JsonValue | undefined): Limits {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => {
    const n = source[key];
    return [key, typeof n === "number" && Number.isInteger(n) && n > 0 ? n : fallback];
  })) as Limits;
}
export async function freePlan(tx: Prisma.TransactionClient) {
  return tx.plan.upsert({ where: { name: "Free" }, update: {}, create: { name: "Free", limits: defaults } });
}
