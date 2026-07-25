import { describe, expect, it, vi } from "vitest";
import {
  runRefreshMetaTokens,
  type RefreshMetaTokensDeps,
  type RefreshMetaTokensSocialAccount,
} from "./refresh-meta-tokens.js";

const TOKEN_ENCRYPTION_KEY = "fixture-key";
const NOW = new Date("2026-07-25T12:00:00.000Z");

function buildAccount(overrides: Partial<RefreshMetaTokensSocialAccount> = {}): RefreshMetaTokensSocialAccount {
  return {
    id: "account_threads_1",
    accessTokenEncrypted: "encrypted-threads-token",
    business: { name: "Boutique Addis", telegramOwnerUserId: 555666777n },
    ...overrides,
  };
}

function buildDeps(
  overrides: Partial<{
    accounts: RefreshMetaTokensSocialAccount[];
    refreshThreadsLongLivedToken: RefreshMetaTokensDeps["refreshThreadsLongLivedToken"];
    notifySeller: ReturnType<typeof vi.fn>;
    refreshThresholdDays: number;
  }> = {},
): {
  deps: RefreshMetaTokensDeps;
  findMany: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  notifySeller: ReturnType<typeof vi.fn>;
} {
  const accounts = overrides.accounts ?? [buildAccount()];
  const findMany = vi.fn().mockResolvedValue(accounts);
  const update = vi.fn().mockResolvedValue(undefined);
  const notifySeller = overrides.notifySeller ?? vi.fn().mockResolvedValue(undefined);

  const deps: RefreshMetaTokensDeps = {
    store: { socialAccount: { findMany, update } },
    refreshThreadsLongLivedToken:
      overrides.refreshThreadsLongLivedToken ??
      vi.fn().mockResolvedValue({ accessToken: "threads-refreshed-token", expiresIn: 5_184_000 }),
    decryptToken: vi.fn((payload: string) => `decrypted:${payload}`),
    encryptToken: vi.fn((plaintext: string) => `encrypted:${plaintext}`),
    tokenEncryptionKey: TOKEN_ENCRYPTION_KEY,
    notifySeller,
    now: () => NOW,
    refreshThresholdDays: overrides.refreshThresholdDays,
  };

  return { deps, findMany, update, notifySeller };
}

describe("runRefreshMetaTokens", () => {
  it("queries active Threads accounts within the default 7-day refresh threshold", async () => {
    const { deps, findMany } = buildDeps();

    await runRefreshMetaTokens(deps);

    expect(findMany).toHaveBeenCalledWith({
      where: {
        platform: "threads",
        status: "active",
        OR: [{ tokenExpiresAt: { lte: new Date("2026-08-01T12:00:00.000Z") } }, { tokenExpiresAt: null }],
      },
      include: { business: true },
    });
  });

  it("honors a custom refreshThresholdDays", async () => {
    const { deps, findMany } = buildDeps({ refreshThresholdDays: 3 });

    await runRefreshMetaTokens(deps);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ tokenExpiresAt: { lte: new Date("2026-07-28T12:00:00.000Z") } }, { tokenExpiresAt: null }],
        }),
      }),
    );
  });

  it("also catches accounts with a null tokenExpiresAt (Meta omitted expires_in on write)", async () => {
    const { deps, findMany } = buildDeps();

    await runRefreshMetaTokens(deps);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ OR: expect.arrayContaining([{ tokenExpiresAt: null }]) }) }),
    );
  });

  it("refreshes a token, encrypts and persists the new token + expiry", async () => {
    const { deps, update } = buildDeps();

    const result = await runRefreshMetaTokens(deps);

    expect(deps.decryptToken).toHaveBeenCalledWith("encrypted-threads-token", TOKEN_ENCRYPTION_KEY);
    expect(deps.refreshThreadsLongLivedToken).toHaveBeenCalledWith({ accessToken: "decrypted:encrypted-threads-token" });
    expect(update).toHaveBeenCalledWith({
      where: { id: "account_threads_1" },
      data: {
        accessTokenEncrypted: "encrypted:threads-refreshed-token",
        tokenExpiresAt: new Date(NOW.getTime() + 5_184_000 * 1000),
      },
    });
    expect(result).toEqual({ refreshed: 1, failed: 0 });
  });

  it("stores a null tokenExpiresAt when the refresh response has no expires_in", async () => {
    const { deps, update } = buildDeps({
      refreshThreadsLongLivedToken: vi.fn().mockResolvedValue({ accessToken: "threads-refreshed-token" }),
    });

    await runRefreshMetaTokens(deps);

    expect(update).toHaveBeenCalledWith({
      where: { id: "account_threads_1" },
      data: { accessTokenEncrypted: "encrypted:threads-refreshed-token", tokenExpiresAt: null },
    });
  });

  it("marks the account errored and notifies the seller when the refresh call fails", async () => {
    const { deps, update, notifySeller } = buildDeps({
      refreshThreadsLongLivedToken: vi.fn().mockRejectedValue(new Error("invalid token")),
    });

    const result = await runRefreshMetaTokens(deps);

    expect(update).toHaveBeenCalledWith({ where: { id: "account_threads_1" }, data: { status: "error" } });
    expect(notifySeller).toHaveBeenCalledWith({
      chatId: 555666777n,
      text: expect.stringContaining("Boutique Addis"),
    });
    expect(result).toEqual({ refreshed: 0, failed: 1 });
  });

  it("does not fail the run when notifying the seller of a refresh failure fails", async () => {
    const { deps } = buildDeps({
      refreshThreadsLongLivedToken: vi.fn().mockRejectedValue(new Error("invalid token")),
      notifySeller: vi.fn().mockRejectedValue(new Error("telegram unreachable")),
    });

    await expect(runRefreshMetaTokens(deps)).resolves.toEqual({ refreshed: 0, failed: 1 });
  });

  it("processes every account independently, tallying refreshed vs failed", async () => {
    const { deps, notifySeller } = buildDeps({
      accounts: [
        buildAccount({ id: "account_1" }),
        buildAccount({ id: "account_2", accessTokenEncrypted: "encrypted-bad-token" }),
      ],
      refreshThreadsLongLivedToken: vi.fn().mockImplementation(({ accessToken }: { accessToken: string }) => {
        if (accessToken.includes("bad-token")) {
          return Promise.reject(new Error("invalid token"));
        }
        return Promise.resolve({ accessToken: "threads-refreshed-token", expiresIn: 5_184_000 });
      }),
    });

    const result = await runRefreshMetaTokens(deps);

    expect(result).toEqual({ refreshed: 1, failed: 1 });
    expect(notifySeller).toHaveBeenCalledTimes(1);
  });
});
