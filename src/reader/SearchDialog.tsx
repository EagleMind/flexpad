import { useEffect, useId, useMemo, useRef, useState } from "react";
import { t } from "../strings";
import { Dialog } from "../ui/Dialog";
import { SearchIndex, type Hit } from "./search";

interface Props {
  open: boolean;
  root: ShadowRoot | null;
  onClose: () => void;
  onPick: (hit: Hit) => void;
}

export function SearchDialog({ open, root, onClose, onPick }: Props) {
  const [index, setIndex] = useState<{ root: ShadowRoot; index: SearchIndex } | null>(null);
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const resultsId = useId();

  // Build the index on first use for each document.
  useEffect(() => {
    if (!open || !root || index?.root === root) return;
    let cancelled = false;
    void SearchIndex.build(root).then((built) => !cancelled && setIndex({ root, index: built }));
    return () => {
      cancelled = true;
    };
  }, [open, root, index]);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  const ready = index && index.root === root ? index.index : null;
  const hits = useMemo(() => (ready ? ready.search(query) : []), [ready, query]);

  return (
    <Dialog open={open} title={t.search} onClose={onClose} className="search">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          if (hits[0]) onPick(hits[0]);
        }}
      >
        <label htmlFor={`${resultsId}-q`} className="visually-hidden">
          {t.searchLabel}
        </label>
        <input
          ref={input}
          id={`${resultsId}-q`}
          type="search"
          value={query}
          placeholder={t.searchLabel}
          autoComplete="off"
          aria-controls={resultsId}
          onChange={(e) => setQuery(e.target.value)}
        />
      </form>
      <p className="search-status" role="status">
        {!ready
          ? t.searchIndexing
          : query.trim()
            ? hits.length
              ? t.searchCount(hits.length)
              : t.searchNone
            : ""}
      </p>
      <ul id={resultsId} className="results">
        {hits.map((hit) => (
          <li key={hit.id}>
            <button type="button" className="result" onClick={() => onPick(hit)}>
              <span className="result-chapter">{hit.chapter}</span>
              <span className="result-snippet">{hit.snippet}</span>
            </button>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
