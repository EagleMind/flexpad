// FlexPad's IndexedDB: the library (document bytes), reading positions, trusted public keys,
// and a per-install random salt. Nothing here leaves the device.
import { openDB, type DBSchema, type IDBPDatabase } from "idb";

export interface LibraryRecord {
  hash: string;
  name: string;
  title: string;
  identifier: string | null;
  size: number;
  opened: number;
  /** The document's bytes. An ArrayBuffer, not a Blob: WebKit refuses Blobs in IndexedDB in private browsing. */
  data: ArrayBuffer;
}

export interface PositionRecord {
  contentHash: string;
  chapter: number;
  block: number;
  headingId: string | null;
  saved: number;
}

export interface TrustedKey {
  /** `${kid} ${x}`: one entry per distinct key. */
  id: string;
  kid: string;
  x: string;
  added: number;
}

interface Schema extends DBSchema {
  library: { key: string; value: LibraryRecord; indexes: { opened: number } };
  positions: { key: string; value: PositionRecord };
  keys: { key: string; value: TrustedKey };
  meta: { key: string; value: Uint8Array };
}

let db: Promise<IDBPDatabase<Schema>> | null = null;

export function database(): Promise<IDBPDatabase<Schema>> {
  db ??= openDB<Schema>("flexpad", 1, {
    upgrade(d) {
      d.createObjectStore("library", { keyPath: "hash" }).createIndex("opened", "opened");
      d.createObjectStore("positions");
      d.createObjectStore("keys", { keyPath: "id" });
      d.createObjectStore("meta");
    },
  });
  return db;
}

/** A random salt created on first use, so stored position keys don't reveal which documents were read. */
export async function salt(): Promise<Uint8Array> {
  const d = await database();
  const existing = await d.get("meta", "salt");
  if (existing) return existing;
  const fresh = crypto.getRandomValues(new Uint8Array(32));
  await d.put("meta", fresh, "salt");
  return fresh;
}
