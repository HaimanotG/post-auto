import type { FastifyReply, FastifyRequest } from "fastify";

export interface AuthenticatedUser {
  id: string;
  telegramUserId: bigint;
}

/**
 * Structural subset of PrismaClient shared by every route that needs to
 * resolve "the business this Telegram user owns" — first extracted out of
 * routes/oauth.ts when routes/posts.ts (m1-09) needed the identical
 * resolveOwnedBusiness/requireAuthenticatedUser logic, so the two routes
 * don't drift.
 */
export interface BusinessContextStore {
  business: {
    findFirst(args: { where: { telegramOwnerUserId: bigint } }): Promise<{ id: string } | null>;
    create(args: {
      data: { name: string; telegramOwnerUserId: bigint; timezone: string };
    }): Promise<{ id: string }>;
  };
  businessMember: {
    upsert(args: {
      where: { businessId_userId: { businessId: string; userId: string } };
      update: Record<string, never>;
      create: { businessId: string; userId: string; role: "owner" };
    }): Promise<unknown>;
  };
}

export async function requireAuthenticatedUser(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<AuthenticatedUser | undefined> {
  try {
    const decoded = await request.jwtVerify<{ sub: string; telegramUserId: string }>();
    return { id: decoded.sub, telegramUserId: BigInt(decoded.telegramUserId) };
  } catch {
    await reply.code(401).send({ error: "Missing or invalid Authorization token" });
    return undefined;
  }
}

/**
 * Finds the business this Telegram user owns (per PLAN.md's `businesses`
 * table), creating one on first use, and ensures an owner membership row
 * exists. Every M1 route that needs a business_id resolves it this way until
 * a dedicated onboarding/business-creation flow exists.
 */
export async function resolveOwnedBusiness(
  prisma: BusinessContextStore,
  user: AuthenticatedUser,
): Promise<{ id: string }> {
  const existing = await prisma.business.findFirst({ where: { telegramOwnerUserId: user.telegramUserId } });
  const business =
    existing ??
    (await prisma.business.create({
      data: {
        name: `Business ${user.telegramUserId}`,
        telegramOwnerUserId: user.telegramUserId,
        timezone: "Africa/Addis_Ababa",
      },
    }));

  await prisma.businessMember.upsert({
    where: { businessId_userId: { businessId: business.id, userId: user.id } },
    update: {},
    create: { businessId: business.id, userId: user.id, role: "owner" },
  });

  return business;
}
