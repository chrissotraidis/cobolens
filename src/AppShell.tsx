import type { ComponentProps } from "react";
import { ExportToast } from "./export/ExportToast";
import { SettingsHost } from "./settings/SettingsHost";
import { TopBar } from "./topbar/TopBar";
import { WorkspaceShell } from "./workspace/WorkspaceShell";
import { WorkspaceSkipLinks } from "./workspace/WorkspaceSkipLinks";

type AppShellProps = {
  topBar: ComponentProps<typeof TopBar>;
  exportToast: ComponentProps<typeof ExportToast> | null;
  settings: ComponentProps<typeof SettingsHost>;
  workspace: ComponentProps<typeof WorkspaceShell>;
};

export function AppShell({ topBar, exportToast, settings, workspace }: AppShellProps) {
  return (
    <main className="workspace" aria-label="Cobolens workspace">
      <WorkspaceSkipLinks />
      <TopBar {...topBar} />
      {exportToast ? <ExportToast {...exportToast} /> : null}
      <SettingsHost {...settings} />
      <WorkspaceShell {...workspace} />
    </main>
  );
}
