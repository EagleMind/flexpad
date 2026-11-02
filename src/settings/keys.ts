// Trusted publisher keys: public Ed25519 JWKs the reader imported. Private keys are refused.
import { database, type TrustedKey } from "../db";

export class KeyImportError extends Error {}

/** Parse a JWKS, a JWK, or a list of JWKs into public Ed25519 keys. Pure, for testing. */
export function parseKeys(text: string): { kid: string; x: string }[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new KeyImportError("This file is not JSON.");
  }
  const list: unknown[] = Array.isArray(data)
    ? data
    : data && typeof data === "object" && Array.isArray((data as { keys?: unknown }).keys)
      ? (data as { keys: unknown[] }).keys
      : [data];
  const keys: { kid: string; x: string }[] = [];
  for (const k of list) {
    if (!k || typeof k !== "object") continue;
    const jwk = k as Record<string, unknown>;
    if ("d" in jwk)
      throw new KeyImportError(
        "This is a private key. Import the publisher's public key set instead.",
      );
    if (
      jwk.kty !== "OKP" ||
      jwk.crv !== "Ed25519" ||
      typeof jwk.x !== "string" ||
      typeof jwk.kid !== "string"
    )
      continue;
    if (jwk.use !== undefined && jwk.use !== "sig") continue;
    keys.push({ kid: jwk.kid, x: jwk.x });
  }
  if (!keys.length)
    throw new KeyImportError("No Ed25519 signing keys with a key ID were found in this file.");
  return keys;
}

export async function trustedKeys(): Promise<TrustedKey[]> {
  return (await database()).getAll("keys");
}

export async function trust(keys: { kid: string; x: string }[]): Promise<number> {
  const d = await database();
  for (const k of keys) await d.put("keys", { id: `${k.kid} ${k.x}`, ...k, added: Date.now() });
  return keys.length;
}

export async function distrust(id: string): Promise<void> {
  await (await database()).delete("keys", id);
}

/** Trusted keys as JWKs for @flexova/core verify(). */
export const asJwks = (keys: TrustedKey[]) => ({
  keys: keys.map(({ kid, x }) => ({ kty: "OKP", crv: "Ed25519", kid, x, use: "sig" })),
});
