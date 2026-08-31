import { useEffect, useMemo, useRef, useState } from "react";
import type { GraphNode } from "../lib/graph";

export type SourceFileEntry = {
  file: string;
  node: GraphNode;
};

export function SourceFilePicker({
  entries,
  selectedFile,
  onSelect,
}: {
  entries: SourceFileEntry[];
  selectedFile: string;
  onSelect: (entry: SourceFileEntry) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const selectedEntry = entries.find((entry) => entry.file === selectedFile);
  const selectedPath = selectedEntry?.file ?? selectedFile;
  const selectedBaseName = selectedPath.split(/[\\/]/).pop() ?? selectedPath;
  const groups = useMemo(() => groupedEntries(entries, selectedFile, query), [entries, query, selectedFile]);
  const visibleCount = groups.reduce((total, group) => total + group.entries.length, 0);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.requestAnimationFrame(() => searchRef.current?.focus());
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="source-file-picker" ref={rootRef}>
      <button
        type="button"
        className="source-file-picker-trigger"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => {
          setQuery("");
          setOpen((current) => !current);
        }}
        title="Switch to another source file"
      >
        <span className="source-file-picker-path">{selectedPath}</span>
        <span className="source-file-picker-basename">{selectedBaseName}</span>
        <small>Switch file</small>
      </button>
      {open ? (
        <div className="source-file-popover" role="dialog" aria-label="Switch source file">
          <div className="source-file-popover-header">
            <div>
              <strong>Switch source file</strong>
              <small>{entries.length} source files</small>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close source file switcher">
              Close
            </button>
          </div>
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="Filter by symbol or path…"
            aria-label="Filter source files"
          />
          <div className="source-file-results">
            {groups.length ? groups.map((group) => (
              <section key={group.label} className="source-file-group" aria-label={group.label}>
                <div className="source-file-group-heading">
                  <span>{group.label}</span>
                  <small>{group.total}</small>
                </div>
                {group.entries.map((entry) => (
                  <button
                    key={entry.file}
                    type="button"
                    className={entry.file === selectedFile ? "is-active" : undefined}
                    aria-current={entry.file === selectedFile ? "true" : undefined}
                    onClick={() => {
                      onSelect(entry);
                      setOpen(false);
                    }}
                  >
                    <strong>{entry.node.name}</strong>
                    <small>{entry.file}</small>
                  </button>
                ))}
              </section>
            )) : <p>No source files match “{query}”.</p>}
          </div>
          {visibleCount < entries.length ? (
            <div className="source-file-results-note">
              Showing {visibleCount} of {entries.length}. Type to find any symbol or path.
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function groupedEntries(entries: SourceFileEntry[], selectedFile: string, query: string) {
  const needle = query.trim().toLocaleLowerCase();
  const filtered = entries.filter((entry) => {
    if (!needle) return true;
    return `${entry.node.name} ${entry.node.type} ${entry.file}`.toLocaleLowerCase().includes(needle);
  });
  const labels = ["Programs", "Copybooks", "JCL", "Other"];
  return labels.flatMap((label) => {
    const matching = filtered
      .filter((entry) => sourceGroupLabel(entry.node.type) === label)
      .sort((left, right) => left.node.name.localeCompare(right.node.name, undefined, { sensitivity: "base" }));
    if (!matching.length) return [];
    const limit = needle ? 60 : 12;
    const visible = matching.slice(0, limit);
    const selected = matching.find((entry) => entry.file === selectedFile);
    const withSelected = selected && !visible.some((entry) => entry.file === selected.file)
      ? [...visible.slice(0, Math.max(0, limit - 1)), selected]
      : visible;
    return [{ label, total: matching.length, entries: withSelected }];
  });
}

function sourceGroupLabel(type: string) {
  if (type === "program") return "Programs";
  if (type === "copybook") return "Copybooks";
  if (type === "jcl-job" || type === "jcl-step") return "JCL";
  return "Other";
}
