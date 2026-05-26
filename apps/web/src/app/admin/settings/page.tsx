import { getOrCreateInstance } from "~/lib/instance";
import { env } from "~/lib/env";
import { Surface } from "~/components/ui";
import { SettingsForm } from "./settings-form";

export const dynamic = "force-dynamic";

export default async function AdminSettings() {
  const inst = await getOrCreateInstance();
  const e = env();
  return (
    <div className="max-w-3xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl tracking-tight">Instance settings</h1>
        <p className="text-sm text-[var(--color-star-500)] font-mono">{inst.name}</p>
      </header>

      <SettingsForm defaultName={inst.name} />

      <Surface className="space-y-2">
        <p className="text-xs uppercase tracking-wide text-[var(--color-star-500)]">
          Runtime (read-only, controlled by .env)
        </p>
        <Row k="NODE_ENV" v={e.NODE_ENV} />
        <Row k="APP_URL" v={e.APP_URL} />
        <Row k="SUPER_ADMIN_EMAIL" v={e.SUPER_ADMIN_EMAIL} />
        <Row k="STT (Whisper)" v={e.OPENAI_API_KEY ? "Enabled" : "Disabled (OPENAI_API_KEY missing)"} />
        <Row k="WHISPER_MONTHLY_MINUTES_CAP" v={String(e.WHISPER_MONTHLY_MINUTES_CAP) + (e.WHISPER_MONTHLY_MINUTES_CAP === 0 ? " (unlimited)" : " min")} />
        <Row k="BUCKET_ENDPOINT" v={e.BUCKET_ENDPOINT} />
        <Row k="BUCKET_NAME" v={e.BUCKET_NAME} />
      </Surface>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4 text-xs font-mono py-1 border-b border-[var(--color-space-border)] last:border-0">
      <span className="text-[var(--color-star-500)]">{k}</span>
      <span className="text-[var(--color-star-300)] truncate">{v}</span>
    </div>
  );
}
