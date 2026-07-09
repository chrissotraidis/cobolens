import type { ComponentProps } from "react";
import { ExportDialog } from "./export/ExportDialog";
import { ExportToast } from "./export/ExportToast";
import { SettingsHost } from "./settings/SettingsHost";
import { TopBar } from "./topbar/TopBar";
import { WorkspaceShell } from "./workspace/WorkspaceShell";
import { WorkspaceSkipLinks } from "./workspace/WorkspaceSkipLinks";

type AppShellProps = {
  topBar: ComponentProps<typeof TopBar>;
  exportDialog: ComponentProps<typeof ExportDialog>;
  exportToast: ComponentProps<typeof ExportToast> | null;
  settings: ComponentProps<typeof SettingsHost>;
  workspace: ComponentProps<typeof WorkspaceShell>;
};

export function AppShell({ topBar, exportDialog, exportToast, settings, workspace }: AppShellProps) {
  return (
    <main className="workspace" aria-label="Cobolens workspace">
      <WorkspaceSkipLinks />
      <TopBar {...topBar} />
      <ExportDialog {...exportDialog} />
      {exportToast ? <ExportToast {...exportToast} /> : null}
      <SettingsHost {...settings} />
      <WorkspaceShell {...workspace} />
    </main>
  );
}
