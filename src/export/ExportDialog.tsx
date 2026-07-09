import type { DocumentationExportOptions } from "./docs";

type ExportDialogProps = {
  open: boolean;
  packageName: string;
  options: DocumentationExportOptions;
  desktopAvailable: boolean;
  exporting: boolean;
  onOptionsChange: (options: DocumentationExportOptions) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ExportDialog({
  open,
  packageName,
  options,
  desktopAvailable,
  exporting,
  onOptionsChange,
  onCancel,
  onConfirm,
}: ExportDialogProps) {
  if (!open) return null;

  const selectedCount = Number(options.markdown) + Number(options.mermaid) + Number(options.png);

  function updateOption(key: keyof DocumentationExportOptions, checked: boolean) {
    onOptionsChange({ ...options, [key]: checked });
  }

  return (
    <div className="export-backdrop" role="presentation">
      <section className="export-dialog" role="dialog" aria-modal="true" aria-labelledby="export-title" tabIndex={-1}>
        <header className="export-dialog-header">
          <div>
            <h2 id="export-title">Export package</h2>
            <p>
              Cobolens will create <code>{packageName}</code>
              {desktopAvailable ? " inside the folder you choose." : " as selected browser downloads."}
            </p>
          </div>
          <button type="button" onClick={onCancel} disabled={exporting} aria-label="Close export options">
            Close
          </button>
        </header>

        <div className="export-option-list" aria-label="Choose export artifacts">
          <label className="export-option">
            <input
              type="checkbox"
              checked={options.markdown}
              onChange={(event) => updateOption("markdown", event.currentTarget.checked)}
            />
            <span>
              <strong>Markdown documentation</strong>
              <small>Inventory, summaries, lineage, parse health, and cited evidence.</small>
            </span>
          </label>
          <label className="export-option">
            <input
              type="checkbox"
              checked={options.mermaid}
              onChange={(event) => updateOption("mermaid", event.currentTarget.checked)}
            />
            <span>
              <strong>Mermaid diagram</strong>
              <small>Editable dependency diagram for docs and pull requests.</small>
            </span>
          </label>
          <label className="export-option">
            <input type="checkbox" checked={options.png} onChange={(event) => updateOption("png", event.currentTarget.checked)} />
            <span>
              <strong>PNG diagram</strong>
              <small>Static image of the focused dependency view.</small>
            </span>
          </label>
        </div>

        {!desktopAvailable ? (
          <p className="export-preview-note">Browser preview cannot create folders; the desktop app writes this as one clean package folder.</p>
        ) : null}

        <div className="button-row two">
          <button type="button" onClick={onCancel} disabled={exporting}>
            Cancel
          </button>
          <button type="button" className="primary-action" onClick={onConfirm} disabled={exporting || selectedCount === 0}>
            {exporting ? "Exporting" : `Export ${selectedCount || ""}`.trim()}
          </button>
        </div>
      </section>
    </div>
  );
}
