import { vi } from "vitest";
import type { TelegramUserStore } from "../middleware/telegram-init-data.js";
import type { OAuthStore } from "../routes/oauth.js";
import type { PostStore } from "../routes/posts.js";
import type { WebhookEventStore } from "../routes/webhooks-meta.js";

export type FixturePrismaStore = TelegramUserStore & OAuthStore & PostStore & WebhookEventStore;

/** 32 raw bytes hex-encoded (64 hex chars) — satisfies TOKEN_ENCRYPTION_KEY's shape for tests. */
export const FIXTURE_TOKEN_ENCRYPTION_KEY = "0011223344556677889900112233445566778899001122334455667788990011";

/**
 * Fully-typed Prisma stub satisfying every route's structural store
 * interface, so individual tests only need to override the delegate methods
 * they actually exercise instead of re-declaring the whole shape each time.
 */
export function createFixturePrismaStore(
  overrides: {
    user?: Partial<FixturePrismaStore["user"]>;
    business?: Partial<FixturePrismaStore["business"]>;
    businessMember?: Partial<FixturePrismaStore["businessMember"]>;
    oAuthState?: Partial<FixturePrismaStore["oAuthState"]>;
    socialAccount?: Partial<FixturePrismaStore["socialAccount"]>;
    post?: Partial<FixturePrismaStore["post"]>;
    webhookEvent?: Partial<FixturePrismaStore["webhookEvent"]>;
  } = {},
): FixturePrismaStore {
  return {
    user: { upsert: vi.fn(), ...overrides.user },
    business: { findFirst: vi.fn(), create: vi.fn(), ...overrides.business },
    businessMember: { upsert: vi.fn(), ...overrides.businessMember },
    oAuthState: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), ...overrides.oAuthState },
    socialAccount: { upsert: vi.fn(), findMany: vi.fn(), ...overrides.socialAccount },
    post: { create: vi.fn(), ...overrides.post },
    webhookEvent: { create: vi.fn().mockResolvedValue({ id: "webhook_event_1" }), ...overrides.webhookEvent },
  } as FixturePrismaStore;
}
