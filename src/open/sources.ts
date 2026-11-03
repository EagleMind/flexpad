// Where documents come from, and the checks applied before opening them.
export class OpenError extends Error {}

export const ACCEPT = ".flexova,application/vnd.flexova+zip";
export const MAX_BYTES = 512 * 1024 * 1024; // the format's total size limit

/** `?src=` may only name a same-origin URL: FlexPad never fetches documents from other sites. */
export function sameOriginUrl(src: string, base: string): URL {
  let url: URL;
  try {
    url = new URL(src, base);
  } catch {
    throw new OpenError("The document address is not a valid URL.");
  }
  if (url.origin !== new URL(base).origin) {
    throw new OpenError(
      "FlexPad only opens documents from its own site by address. Download the file and open it instead.",
    );
  }
  return url;
}

export async function fetchDocument(url: URL): Promise<Uint8Array> {
  const response = await fetch(url, { credentials: "same-origin" });
  if (!response.ok)
    throw new OpenError(`The document could not be downloaded (HTTP ${response.status}).`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > MAX_BYTES)
    throw new OpenError("The document is larger than the 512 MB limit.");
  return bytes;
}

export async function fileBytes(file: Blob): Promise<Uint8Array> {
  if (file.size > MAX_BYTES) throw new OpenError("The document is larger than the 512 MB limit.");
  return new Uint8Array(await file.arrayBuffer());
}

export const displayName = (name: string) => name.replace(/\.flexova$/i, "") || name;
