import { getSettings } from "@/lib/settings";
import { requireAdmin } from "@/lib/viewer";
import { SettingsForm } from "./SettingsForm";

export default async function SettingsPage() {
  await requireAdmin("OWNER");
  const settings = await getSettings();
  return (
    <>
      <h1>Настройки</h1>
      <SettingsForm s={settings} />
    </>
  );
}
