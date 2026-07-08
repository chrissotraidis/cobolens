type ExportToastProps = {
  status: string;
  onDismiss: () => void;
};

export function ExportToast({ status, onDismiss }: ExportToastProps) {
  return (
    <div className="export-toast" role="status" aria-live="polite">
      <span>{status}</span>
      <button type="button" onClick={onDismiss} aria-label="Dismiss export status">
        Dismiss
      </button>
    </div>
  );
}
