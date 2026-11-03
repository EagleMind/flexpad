// Unsaved work, kept on this device so a crash or a closed tab loses nothing. One draft per document.
import { openDB, type DBSchema } from "idb";
import type { Node as PMNode } from "prosemirror-model";
import { AssetStore, type StoredAsset } from "./assets";
import type { DocMeta } from "./load";
import { schema } from "./schema";

interface Draft {
  identifier: string;
  name: string;
  saved: number;
  doc: unknown;
  meta: DocMeta;
  assets: [string, StoredAsset][];
}

interface Schema extends DBSchema {
  drafts: { key: string; value: Draft };
}

const db = () =>
  openDB<Schema>("flexpad-drafts", 1, {
    upgrade(d) {
      d.createObjectStore("drafts", { keyPath: "identifier" });
    },
  });

export async function keepDraft(
  doc: PMNode,
  meta: DocMeta,
  assets: AssetStore,
  name: string,
): Promise<void> {
  try {
    const items: [string, StoredAsset][] = assets
      .keys()
      .map((k) => [k, assets.get(k) as StoredAsset]);
    await (
      await db()
    ).put("drafts", {
      identifier: meta.identifier,
      name,
      saved: Date.now(),
      doc: doc.toJSON(),
      meta,
      assets: items,
    });
  } catch {
    // Storage unavailable (private browsing): drafts are a safety net, not a requirement.
  }
}

export async function findDraft(
  identifier: string,
): Promise<{ saved: number; name: string } | null> {
  try {
    const d = await (await db()).get("drafts", identifier);
    return d ? { saved: d.saved, name: d.name } : null;
  } catch {
    return null;
  }
}

export async function restoreDraft(
  identifier: string,
): Promise<{ doc: PMNode; meta: DocMeta; assets: AssetStore; name: string } | null> {
  const d = await (await db()).get("drafts", identifier);
  if (!d) return null;
  const assets = new AssetStore();
  for (const [key, asset] of d.assets) assets.set(key, asset);
  return { doc: schema.nodeFromJSON(d.doc), meta: d.meta, assets, name: d.name };
}

export async function dropDraft(identifier: string): Promise<void> {
  try {
    await (await db()).delete("drafts", identifier);
  } catch {
    // Nothing to remove.
  }
}
