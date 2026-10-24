import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import {
  lumoOAuthStates,
  lumoProviderConnections,
} from "../../../drizzle/schema";
import { getDb } from "../../db";
import {
  OAuthTokenCipher,
  type OAuthKeyVersion,
} from "./crypto";

export const oauthProviderSchema = ["github", "google"] as const;
export type OAuthProvider = (typeof oauthProviderSchema)[number];
export type ProviderConnectionState = "connected" | "expired" | "revoked" | "error";

export type StoredProviderConnection = {
  id: string;
  ownerKey: string;
  provider: OAuthProvider;
  providerAccountId: string;
  providerLogin: string | null;
  accessTokenCiphertext: string;
  refreshTokenCiphertext: string | null;
  tokenKeyVersion: OAuthKeyVersion;
  accessTokenExpiresAt: Date | null;
  scopes: string[];
  state: ProviderConnectionState;
  lastRefreshAt: Date | null;
  lastValidatedAt: Date | null;
};

export type OAuthStateRecord = {
  id: string;
  stateHash: string;
  ownerKey: string;
  provider: OAuthProvider;
  pkceVerifierCiphertext: string | null;
  keyVersion: OAuthKeyVersion | null;
  redirectUri: string;
  expiresAt: Date;
  consumedAt: Date | null;
};

export interface OAuthPersistence {
  saveConnection(connection: StoredProviderConnection): Promise<void>;
  getConnection(ownerKey: string, provider: OAuthProvider): Promise<StoredProviderConnection | null>;
  revokeConnection(ownerKey: string, provider: OAuthProvider): Promise<void>;
  setConnectionState(
    ownerKey: string,
    provider: OAuthProvider,
    state: ProviderConnectionState
  ): Promise<void>;
  insertState(record: OAuthStateRecord): Promise<void>;
  consumeState(input: {
    stateHash: string;
    ownerKey: string;
    provider: OAuthProvider;
    now: Date;
  }): Promise<OAuthStateRecord | null>;
}

const hashState = (state: string) =>
  createHash("sha256").update(state).digest("hex");
const resultAffectedRows = (result: unknown) =>
  (result as { affectedRows?: number }).affectedRows ?? 0;

export class DatabaseOAuthPersistence implements OAuthPersistence {
  async saveConnection(connection: StoredProviderConnection) {
    const db = await getDb();
    if (!db) throw new Error("OAuth database is unavailable.");
    await db
      .insert(lumoProviderConnections)
      .values({
        id: connection.id,
        ownerKey: connection.ownerKey,
        provider: connection.provider,
        providerAccountId: connection.providerAccountId,
        providerLogin: connection.providerLogin,
        accessTokenCiphertext: connection.accessTokenCiphertext,
        refreshTokenCiphertext: connection.refreshTokenCiphertext,
        tokenKeyVersion: connection.tokenKeyVersion,
        accessTokenExpiresAt: connection.accessTokenExpiresAt,
        scopes: connection.scopes,
        state: connection.state,
        lastRefreshAt: connection.lastRefreshAt,
        lastValidatedAt: connection.lastValidatedAt,
      })
      .onDuplicateKeyUpdate({
        set: {
          providerAccountId: connection.providerAccountId,
          providerLogin: connection.providerLogin,
          accessTokenCiphertext: connection.accessTokenCiphertext,
          refreshTokenCiphertext: connection.refreshTokenCiphertext,
          tokenKeyVersion: connection.tokenKeyVersion,
          accessTokenExpiresAt: connection.accessTokenExpiresAt,
          scopes: connection.scopes,
          state: connection.state,
          lastRefreshAt: connection.lastRefreshAt,
          lastValidatedAt: connection.lastValidatedAt,
        },
      });
  }

  async getConnection(ownerKey: string, provider: OAuthProvider) {
    const db = await getDb();
    if (!db) return null;
    const rows = await db
      .select()
      .from(lumoProviderConnections)
      .where(
        and(
          eq(lumoProviderConnections.ownerKey, ownerKey),
          eq(lumoProviderConnections.provider, provider)
        )
      )
      .limit(1);
    return rows[0] ? this.toConnection(rows[0]) : null;
  }

  async revokeConnection(ownerKey: string, provider: OAuthProvider) {
    const db = await getDb();
    if (!db) throw new Error("OAuth database is unavailable.");
    await db
      .update(lumoProviderConnections)
      .set({ state: "revoked" })
      .where(
        and(
          eq(lumoProviderConnections.ownerKey, ownerKey),
          eq(lumoProviderConnections.provider, provider)
        )
      );
  }

  async setConnectionState(
    ownerKey: string,
    provider: OAuthProvider,
    state: ProviderConnectionState
  ) {
    const db = await getDb();
    if (!db) throw new Error("OAuth database is unavailable.");
    await db
      .update(lumoProviderConnections)
      .set({ state })
      .where(
        and(
          eq(lumoProviderConnections.ownerKey, ownerKey),
          eq(lumoProviderConnections.provider, provider)
        )
      );
  }

  async insertState(record: OAuthStateRecord) {
    const db = await getDb();
    if (!db) throw new Error("OAuth database is unavailable.");
    await db.insert(lumoOAuthStates).values({
      id: record.id,
      stateHash: record.stateHash,
      ownerKey: record.ownerKey,
      provider: record.provider,
      pkceVerifierCiphertext: record.pkceVerifierCiphertext,
      keyVersion: record.keyVersion,
      redirectUri: record.redirectUri,
      expiresAt: record.expiresAt,
    });
  }

  async consumeState(input: {
    stateHash: string;
    ownerKey: string;
    provider: OAuthProvider;
    now: Date;
  }) {
    const db = await getDb();
    if (!db) return null;
    const rows = await db
      .select()
      .from(lumoOAuthStates)
      .where(
        and(
          eq(lumoOAuthStates.stateHash, input.stateHash),
          eq(lumoOAuthStates.ownerKey, input.ownerKey),
          eq(lumoOAuthStates.provider, input.provider),
          isNull(lumoOAuthStates.consumedAt),
          gt(lumoOAuthStates.expiresAt, input.now)
        )
      )
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    const updated = await db
      .update(lumoOAuthStates)
      .set({ consumedAt: input.now })
      .where(
        and(
          eq(lumoOAuthStates.id, row.id),
          isNull(lumoOAuthStates.consumedAt),
          gt(lumoOAuthStates.expiresAt, input.now)
        )
      );
    return resultAffectedRows(updated) === 1
      ? {
          ...row,
          consumedAt: input.now,
          provider: row.provider as OAuthProvider,
          keyVersion: row.keyVersion as OAuthKeyVersion | null,
        }
      : null;
  }

  private toConnection(row: typeof lumoProviderConnections.$inferSelect): StoredProviderConnection {
    return {
      ...row,
      provider: row.provider as OAuthProvider,
      state: row.state as ProviderConnectionState,
      tokenKeyVersion: row.tokenKeyVersion as OAuthKeyVersion,
    };
  }
}

export class InMemoryOAuthPersistence implements OAuthPersistence {
  readonly connections = new Map<string, StoredProviderConnection>();
  readonly states = new Map<string, OAuthStateRecord>();

  async saveConnection(connection: StoredProviderConnection) {
    this.connections.set(`${connection.ownerKey}:${connection.provider}`, {
      ...connection,
      scopes: [...connection.scopes],
    });
  }

  async getConnection(ownerKey: string, provider: OAuthProvider) {
    const connection = this.connections.get(`${ownerKey}:${provider}`);
    return connection ? { ...connection, scopes: [...connection.scopes] } : null;
  }

  async revokeConnection(ownerKey: string, provider: OAuthProvider) {
    const connection = this.connections.get(`${ownerKey}:${provider}`);
    if (connection) connection.state = "revoked";
  }

  async setConnectionState(
    ownerKey: string,
    provider: OAuthProvider,
    state: ProviderConnectionState
  ) {
    const connection = this.connections.get(`${ownerKey}:${provider}`);
    if (connection) connection.state = state;
  }

  async insertState(record: OAuthStateRecord) {
    this.states.set(record.stateHash, { ...record });
  }

  async consumeState(input: {
    stateHash: string;
    ownerKey: string;
    provider: OAuthProvider;
    now: Date;
  }) {
    const record = this.states.get(input.stateHash);
    if (
      !record ||
      record.ownerKey !== input.ownerKey ||
      record.provider !== input.provider ||
      record.consumedAt ||
      record.expiresAt <= input.now
    )
      return null;
    record.consumedAt = input.now;
    return { ...record };
  }
}

export class OAuthFoundationService {
  constructor(
    private readonly persistence: OAuthPersistence,
    private readonly cipher: OAuthTokenCipher,
    private readonly now: () => Date = () => new Date(),
    private readonly stateTtlMs = 10 * 60_000
  ) {}

  async createState(input: {
    ownerKey: string;
    provider: OAuthProvider;
    redirectUri: string;
    pkceVerifier?: string;
  }) {
    const state = randomBytes(32).toString("base64url");
    const record: OAuthStateRecord = {
      id: `oauth_state_${randomBytes(10).toString("hex")}`,
      stateHash: hashState(state),
      ownerKey: input.ownerKey,
      provider: input.provider,
      pkceVerifierCiphertext: input.pkceVerifier
        ? this.cipher.encrypt(input.pkceVerifier)
        : null,
      keyVersion: input.pkceVerifier ? this.cipher.keyVersion : null,
      redirectUri: input.redirectUri,
      expiresAt: new Date(this.now().getTime() + this.stateTtlMs),
      consumedAt: null,
    };
    await this.persistence.insertState(record);
    return { state, expiresAt: record.expiresAt };
  }

  async consumeState(input: {
    state: string;
    ownerKey: string;
    provider: OAuthProvider;
  }) {
    const record = await this.persistence.consumeState({
      stateHash: hashState(input.state),
      ownerKey: input.ownerKey,
      provider: input.provider,
      now: this.now(),
    });
    if (!record) return null;
    return {
      ...record,
      pkceVerifier: record.pkceVerifierCiphertext
        ? this.cipher.decrypt(record.pkceVerifierCiphertext)
        : null,
    };
  }

  async saveProviderTokens(input: {
    ownerKey: string;
    provider: OAuthProvider;
    providerAccountId: string;
    providerLogin?: string | null;
    accessToken: string;
    refreshToken?: string | null;
    accessTokenExpiresAt?: Date | null;
    scopes: string[];
  }) {
    const existing = await this.persistence.getConnection(
      input.ownerKey,
      input.provider
    );
    await this.persistence.saveConnection({
      id: existing?.id ?? `provider_${randomBytes(10).toString("hex")}`,
      ownerKey: input.ownerKey,
      provider: input.provider,
      providerAccountId: input.providerAccountId,
      providerLogin: input.providerLogin ?? null,
      accessTokenCiphertext: this.cipher.encrypt(input.accessToken),
      refreshTokenCiphertext: input.refreshToken
        ? this.cipher.encrypt(input.refreshToken)
        : null,
      tokenKeyVersion: this.cipher.keyVersion,
      accessTokenExpiresAt: input.accessTokenExpiresAt ?? null,
      scopes: [...new Set(input.scopes)],
      state: "connected",
      lastRefreshAt: null,
      lastValidatedAt: this.now(),
    });
  }
}
