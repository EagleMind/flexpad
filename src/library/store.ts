// The library: recently opened documents, kept on the device so they open offline. The original file
// stays the source of truth; this is a cache the reader can clear at any time.
import { database, type LibraryRecord } from "../db";

export const LIMITS = { count: 20, bytes: 200 * 1024 * 1024 };

export type LibraryEntry = Omit<LibraryRecord, "blob">;

/** Which entries to evict, newest first kept, so at most `limits` remain. Pure, for testing. */
export function toEvict(entries: LibraryEntry[], limits = LIMITS): string[] {
  const sorted = [...entries].sort((a, b) => b.opened - a.opened);
  const evict: string[] = [];
  let count = 0;
  let bytes = 0;
  for (const e of sorted) {
    if (count + 1 > limits.count || bytes + e.size > limits.bytes) evict.push(e.hash);
    else {
      count++;
      bytes += e.size;
    }
  }
  return evict;
}

const toEntry = ({ hash, name, title, identifier, size, opened }: LibraryRecord): LibraryEntry => ({
  hash,
  name,
  title,
  identifier,
  size,
  opened,
});

export async function listLibrary(): Promise<LibraryEntry[]> {
  const all = await (await database()).getAll("library");
  return all.map(toEntry).sort((a, b) => b.opened - a.opened);
}

/** Add or refresh a document; returns false if the browser refused to store it (quota, private mode). */
export async function remember(entry: LibraryEntry, bytes: Uint8Array): Promise<boolean> {
  try {
    const d = await database();
    await d.put("library", { ...entry, blob: new Blob([bytes as Uint8Array<ArrayBuffer>]) });
    for (const hash of toEvict(await listLibrary())) await d.delete("library", hash);
    return true;
  } catch {
    return false;
  }
}

export async function loadFromLibrary(
  hash: string,
): Promise<{ entry: LibraryEntry; bytes: Uint8Array } | null> {
  const d = await database();
  const record = await d.get("library", hash);
  if (!record) return null;
  const { blob, ...entry } = record;
  const updated = { ...entry, opened: Date.now() };
  await d.put("library", { ...updated, blob });
  return { entry: updated, bytes: new Uint8Array(await blob.arrayBuffer()) };
}

export async function forget(hash: string): Promise<void> {
  await (await database()).delete("library", hash);
}

export async function forgetAll(): Promise<void> {
  await (await database()).clear("library");
}
