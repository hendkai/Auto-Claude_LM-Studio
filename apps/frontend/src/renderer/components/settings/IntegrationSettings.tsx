import type { AppSettings } from '../../../shared/types';
import { AccountSettings } from './AccountSettings';

interface IntegrationSettingsProps {
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
  isOpen: boolean;
}

// Compatibility bridge for older settings route usage.
export function IntegrationSettings({ settings, onSettingsChange, isOpen }: IntegrationSettingsProps) {
  return (
    <AccountSettings
      settings={settings}
      onSettingsChange={onSettingsChange}
      isOpen={isOpen}
    />
  );
}
