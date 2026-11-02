// Saving files: the File System Access API where available (Chromium on desktop), otherwise a download.
interface WritableHandle {
  name: string;
  createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }>;
}
declare global {
  interface Window {
    showSaveFilePicker?: (options: unknown) => Promise<WritableHandle>;
  }
}

export type SaveHandle = WritableHandle;

export function download(data: Uint8Array | string, name: string, type: string): void {
  const blob = new Blob([typeof data === "string" ? data : (data as Uint8Array<ArrayBuffer>)], {
    type,
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Save package bytes. Reuses `handle` when given; otherwise asks where to save (or downloads). Returns the
 * handle to reuse for the next save, or null when the file was downloaded or the reader cancelled.
 */
export async function saveFile(
  bytes: Uint8Array,
  name: string,
  handle: SaveHandle | null,
): Promise<{ handle: SaveHandle | null; cancelled: boolean }> {
  const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], {
    type: "application/vnd.flexova+zip",
  });
  let target = handle;
  if (!target && window.showSaveFilePicker) {
    try {
      target = await window.showSaveFilePicker({
        suggestedName: name,
        types: [
          {
            description: "Flexova document",
            accept: { "application/vnd.flexova+zip": [".flexova"] },
          },
        ],
      });
    } catch {
      return { handle: null, cancelled: true };
    }
  }
  if (!target) {
    download(bytes, name, "application/vnd.flexova+zip");
    return { handle: null, cancelled: false };
  }
  const writable = await target.createWritable();
  await writable.write(blob);
  await writable.close();
  return { handle: target, cancelled: false };
}

export const fileNameFor = (title: string) =>
  `${
    (title || "document")
      .replace(/[\\/:*?"<>|]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80) || "document"
  }.flexova`;
