import { useEffect, useRef } from "react";
import { SAMPLE_CATALOG } from "./catalog";

export function SampleLibraryDialog({
  open,
  loadingSampleId,
  onClose,
  onSelect,
}: {
  open: boolean;
  loadingSampleId: string;
  onClose: () => void;
  onSelect: (sampleId: string) => void;
}) {
  const dialogRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();
    return () => {
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="sample-library-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        ref={dialogRef}
        className="sample-library-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sample-library-title"
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
        }}
      >
        <header className="sample-library-header">
          <div>
            <span>Choose a starting point</span>
            <h2 id="sample-library-title">Sample library</h2>
            <p>Learn the workflow quickly, then test it against progressively more realistic public COBOL systems.</p>
          </div>
          <button type="button" onClick={onClose} disabled={Boolean(loadingSampleId)} aria-label="Close sample library">
            Close
          </button>
        </header>

        <div className="sample-card-grid">
          {SAMPLE_CATALOG.map((sample) => (
            <article className="sample-card" key={sample.id}>
              <div className="sample-card-topline">
                <span>{sample.eyebrow}</span>
                <small>{sample.scale}</small>
              </div>
              <div className="sample-card-copy">
                <h3>{sample.name}</h3>
                <p>{sample.description}</p>
              </div>
              <dl className="sample-card-stats">
                <div>
                  <dt>Files</dt>
                  <dd>{sample.fileCount.toLocaleString()}</dd>
                </div>
                <div>
                  <dt>Graph nodes</dt>
                  <dd>{sample.nodeCount.toLocaleString()}</dd>
                </div>
              </dl>
              <p className="sample-card-focus"><strong>Exercises</strong> {sample.focus}</p>
              <div className="sample-card-footer">
                <span>{sample.license}</span>
                <button type="button" className="primary-action" onClick={() => onSelect(sample.id)} disabled={Boolean(loadingSampleId)}>
                  {loadingSampleId === sample.id ? "Opening…" : "Open sample"}
                </button>
              </div>
            </article>
          ))}
        </div>

        <p className="sample-library-note">Source is bundled for offline inspection. Public samples retain their upstream license and provenance.</p>
      </section>
    </div>
  );
}
