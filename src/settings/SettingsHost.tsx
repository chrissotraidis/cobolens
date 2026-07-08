import type { ComponentProps } from "react";
import { SettingsDialog } from "./SettingsDialog";

type SettingsHostProps = ComponentProps<typeof SettingsDialog> & {
  open: boolean;
};

export function SettingsHost({ open, ...settingsProps }: SettingsHostProps) {
  if (!open) return null;
  return <SettingsDialog {...settingsProps} />;
}
