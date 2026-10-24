import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

export const SUPPORTED_OAUTH_KEY_VERSIONS = [1] as const;
export type OAuthKeyVersion = (typeof SUPPORTED_OAUTH_KEY_VERSIONS)[number];

export type OAuthEncryptionConfig = {
  key: Buffer;
  version: OAuthKeyVersion;
};

export type OAuthFoundationStatus =
  | { available: true; keyVersion: OAuthKeyVersion }
  | { available: false; reason: "not_configured" | "invalid_configuration" };

const ENVELOPE_PARTS = 4;
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

const decodeBase64Key = (value: string) => {
  const normalized = value.trim();
  if (!normalized) throw new Error("OAuth encryption key is empty.");
  const key = Buffer.from(normalized, "base64");
  if (key.length !== 32 || key.toString("base64") !== normalized)
    throw new Error("OAuth encryption key must be canonical base64 for 32 bytes.");
  return key;
};

export function parseOAuthEncryptionConfig(
  rawKey: string | undefined,
  rawVersion = "1"
): OAuthEncryptionConfig | null {
  if (!rawKey?.trim()) return null;
  const versionNumber = Number(rawVersion);
  if (
    !Number.isSafeInteger(versionNumber) ||
    !SUPPORTED_OAUTH_KEY_VERSIONS.includes(versionNumber as OAuthKeyVersion)
  ) {
    throw new Error("Unsupported OAuth encryption key version.");
  }
  return {
    key: decodeBase64Key(rawKey),
    version: versionNumber as OAuthKeyVersion,
  };
}

export function getOAuthFoundationStatus(
  rawKey = process.env.LUMO_OAUTH_ENCRYPTION_KEY,
  rawVersion = process.env.LUMO_OAUTH_ENCRYPTION_KEY_VERSION ?? "1"
): OAuthFoundationStatus {
  if (!rawKey?.trim()) return { available: false, reason: "not_configured" };
  try {
    const config = parseOAuthEncryptionConfig(rawKey, rawVersion);
    return config
      ? { available: true, keyVersion: config.version }
      : { available: false, reason: "not_configured" };
  } catch {
    return { available: false, reason: "invalid_configuration" };
  }
}

export class OAuthTokenCipher {
  constructor(private readonly config: OAuthEncryptionConfig) {}

  get keyVersion() {
    return this.config.version;
  }

  encrypt(plaintext: string): string {
    if (!plaintext) throw new Error("OAuth token cannot be empty.");
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.config.key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return [
      `v${this.config.version}`,
      iv.toString("base64url"),
      tag.toString("base64url"),
      ciphertext.toString("base64url"),
    ].join(".");
  }

  decrypt(envelope: string): string {
    const parts = envelope.split(".");
    if (parts.length !== ENVELOPE_PARTS) throw new Error("Invalid OAuth ciphertext envelope.");
    const [versionPart, ivPart, tagPart, ciphertextPart] = parts;
    const version = Number(versionPart.slice(1));
    if (
      versionPart[0] !== "v" ||
      !Number.isSafeInteger(version) ||
      version !== this.config.version ||
      !SUPPORTED_OAUTH_KEY_VERSIONS.includes(version as OAuthKeyVersion)
    )
      throw new Error("Unsupported OAuth ciphertext key version.");
    const iv = Buffer.from(ivPart, "base64url");
    const tag = Buffer.from(tagPart, "base64url");
    const ciphertext = Buffer.from(ciphertextPart, "base64url");
    if (iv.length !== IV_BYTES || tag.length !== AUTH_TAG_BYTES || !ciphertext.length)
      throw new Error("Invalid OAuth ciphertext envelope.");
    try {
      const decipher = createDecipheriv(ALGORITHM, this.config.key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]).toString("utf8");
    } catch {
      throw new Error("OAuth ciphertext authentication failed.");
    }
  }
}

export function createOAuthTokenCipherFromEnvironment(): OAuthTokenCipher | null {
  const config = parseOAuthEncryptionConfig(
    process.env.LUMO_OAUTH_ENCRYPTION_KEY,
    process.env.LUMO_OAUTH_ENCRYPTION_KEY_VERSION ?? "1"
  );
  return config ? new OAuthTokenCipher(config) : null;
}
