import type { Verification } from "@flexova/core";
import { useEffect, useState } from "react";
import { checkSignature, type OpenDoc } from "../document";
import { t } from "../strings";
import { Dialog } from "../ui/Dialog";

interface Props {
  open: boolean;
  doc: OpenDoc;
  onClose: () => void;
  onManageKeys: () => void;
}

const size = (n: number) =>
  n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;

export function InfoDialog({ open, doc, onClose, onManageKeys }: Props) {
  const [checked, setChecked] = useState<{ hash: string; result: Verification | null } | null>(
    null,
  );

  useEffect(() => {
    if (!open || !doc.signedBy) return;
    let cancelled = false;
    void checkSignature(doc).then((result) => !cancelled && setChecked({ hash: doc.hash, result }));
    return () => {
      cancelled = true;
    };
  }, [open, doc]);

  const verification = checked && checked.hash === doc.hash ? checked.result : "pending";

  let signature: string;
  if (!doc.signedBy) signature = t.signature.none;
  else if (!doc.info) signature = t.signature.invalid;
  else if (verification === "pending") signature = t.signature.checking;
  else if (verification === null) signature = t.signature.present(doc.signedBy);
  else if (verification.ok) signature = t.signature.verified(verification.kid ?? doc.signedBy);
  else signature = t.signature.failed(verification.message);

  const rows: [string, string][] = [
    [t.fields.title, doc.info?.title || doc.name],
    ...(doc.info?.authors.length
      ? [[t.fields.authors, doc.info.authors.join(", ")] as [string, string]]
      : []),
    ...(doc.info ? [[t.fields.language, doc.info.language] as [string, string]] : []),
    ...(doc.info?.modified
      ? [[t.fields.modified, new Date(doc.info.modified).toLocaleDateString()] as [string, string]]
      : []),
    ...(doc.info ? [[t.fields.chapters, String(doc.info.chapters)] as [string, string]] : []),
    [t.fields.size, size(doc.bytes.length)],
    [t.fields.file, doc.name],
    [t.fields.signature, signature],
  ];

  return (
    <Dialog open={open} title={t.info} onClose={onClose}>
      <dl className="info">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      {doc.signedBy && doc.info && verification !== "pending" && (
        <button type="button" className="link-button" onClick={onManageKeys}>
          {t.trustedKeys}
        </button>
      )}
    </Dialog>
  );
}
