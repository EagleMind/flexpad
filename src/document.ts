// An opened document: its bytes plus what FlexPad shows about it. Invalid packages still open (the viewer
// renders them safely); their problems are listed instead of hidden.
import { FlexovaError, read, sha256, verify, type Report, type Verification } from "@flexova/core";
import { remember } from "./library/store";
import { asJwks, trustedKeys } from "./settings/keys";

export interface DocInfo {
  title: string;
  language: string;
  identifier: string;
  modified: string;
  authors: string[];
  chapters: number;
}

export interface OpenDoc {
  bytes: Uint8Array;
  name: string;
  hash: string;
  info: DocInfo | null;
  report: Report;
  /** The signature's key ID, if the package carries a signature. */
  signedBy: string | null;
  /** Whether the library kept a copy for offline use. */
  kept: boolean;
}

const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");

function signatureKid(file: Uint8Array | undefined): string | null {
  if (!file) return null;
  try {
    const head = new TextDecoder().decode(file).split(".")[0] ?? "";
    const json = atob(
      head.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (head.length % 4)) % 4),
    );
    const kid = (JSON.parse(json) as { kid?: unknown }).kid;
    return typeof kid === "string" ? kid : "?";
  } catch {
    return "?";
  }
}

export async function prepare(bytes: Uint8Array, name: string, keep = true): Promise<OpenDoc> {
  const hash = hex(await sha256(bytes));
  let info: DocInfo | null = null;
  let report: Report;
  let signedBy: string | null = null;
  try {
    const pkg = await read(bytes);
    report = pkg.report;
    info = {
      title: pkg.title,
      language: pkg.language,
      identifier: pkg.identifier,
      modified: pkg.modified,
      authors: pkg.authors,
      chapters: pkg.spine.length,
    };
    signedBy = signatureKid(pkg.entries.get("META-INF/flexova.sig.jws"));
  } catch (e) {
    if (!(e instanceof FlexovaError)) throw e;
    report = e.report;
  }
  const kept =
    keep && info !== null
      ? await remember(
          {
            hash,
            name,
            title: info.title || name,
            identifier: info.identifier || null,
            size: bytes.length,
            opened: Date.now(),
          },
          bytes,
        )
      : false;
  return { bytes, name, hash, info, report, signedBy, kept };
}

/** Verify the document's signature against the keys the reader trusts (null if none are trusted). */
export async function checkSignature(doc: OpenDoc): Promise<Verification | null> {
  const keys = await trustedKeys();
  if (!keys.length) return null;
  return verify(doc.bytes, asJwks(keys));
}

/** The key reading positions are stored under: the document identifier, else the content hash. */
export const positionId = (doc: OpenDoc) => doc.info?.identifier || `sha256:${doc.hash}`;
