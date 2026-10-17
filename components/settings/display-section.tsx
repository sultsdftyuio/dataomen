"use client";

import { setRailMotion, useRailMotion } from "@/components/dashboard/rail-motion";
import { SettingsRow, SettingsSection } from "@/components/settings/settings-section";
import { Switch } from "@/components/ui/switch";

/**
 * Display choices kept on this device. The rings' motion can be stopped
 * here because it starts on its own and keeps going beside the work
 * (WCAG 2.2.2); the system's reduce-motion setting already stops it too.
 */
export function DisplaySection() {
  const motion = useRailMotion();

  return (
    <SettingsSection id="display" title="Display" description="Saved on this device only.">
      <SettingsRow
        label="Ring animation"
        hint="The rings beside the navigation drift slowly and ripple when a page opens"
        action={
          <Switch
            checked={motion}
            onCheckedChange={setRailMotion}
            aria-label="Ring animation"
          />
        }
      >
        {motion ? "On" : "Off"}
      </SettingsRow>
    </SettingsSection>
  );
}
