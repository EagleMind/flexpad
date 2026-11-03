// Images and audio of the document being edited, by key: their path under the package root folder
// (for example "assets/panel.webp"). Chapters live in "content/", so they refer to "../<key>".
import { PROFILE } from "@flexova/core";

export interface StoredAsset {
  data: Uint8Array;
  mediaType: string;
}

const KIND = PROFILE.mediaTypes;

export class AssetStore {
  private readonly items = new Map<string, StoredAsset>();
  private readonly urls = new Map<string, string>();

  static kindOf(mediaType: string): string | undefined {
    return KIND[mediaType];
  }

  set(key: string, asset: StoredAsset): void {
    this.items.set(key, asset);
    const old = this.urls.get(key);
    if (old) URL.revokeObjectURL(old);
    this.urls.delete(key);
  }

  get(key: string): StoredAsset | undefined {
    return this.items.get(key);
  }

  has(key: string): boolean {
    return this.items.has(key);
  }

  keys(): string[] {
    return [...this.items.keys()];
  }

  /** A blob: URL for showing the asset in the editor (created lazily, revoked by dispose()). */
  url(key: string): string {
    const known = this.urls.get(key);
    if (known) return known;
    const asset = this.items.get(key);
    if (!asset || typeof URL.createObjectURL !== "function") return "";
    const url = URL.createObjectURL(
      new Blob([asset.data as Uint8Array<ArrayBuffer>], { type: asset.mediaType }),
    );
    this.urls.set(key, url);
    return url;
  }

  /** A key that is free, based on a file name: "assets/<name>", "assets/<stem>-2.<ext>", … */
  freeKey(name: string): string {
    const clean = name.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[.-]+/, "") || "image";
    const dot = clean.lastIndexOf(".");
    const [stem, ext] = dot > 0 ? [clean.slice(0, dot), clean.slice(dot)] : [clean, ""];
    let key = `assets/${stem}${ext}`;
    for (let n = 2; this.items.has(key); n++) key = `assets/${stem}-${n}${ext}`;
    return key;
  }

  dispose(): void {
    for (const url of this.urls.values()) URL.revokeObjectURL(url);
    this.urls.clear();
  }
}
