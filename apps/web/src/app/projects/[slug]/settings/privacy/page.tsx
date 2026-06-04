import { serverTrpc } from "~/lib/trpc/server";
import { Code, Surface } from "~/components/ui";

export const dynamic = "force-dynamic";

export default async function PrivacySettings({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const trpc = await serverTrpc();
  const project = await trpc.projects.bySlug({ slug });

  return (
    <div className="max-w-3xl space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl tracking-tight">Privacy</h1>
        <p className="text-sm text-[var(--color-star-500)]">
          Masking is controlled by SDK options (since reports originate on the host side).
          Defaults below cover data retention.
        </p>
      </header>

      <section>
        <h2 className="text-xs uppercase tracking-wide text-[var(--color-star-500)] mb-3">
          Masking (SDK option)
        </h2>
        <Surface>
          <p className="text-sm text-[var(--color-star-300)] mb-3">
            In your host app, pass an array of selectors to <Code>{"<QuadProvider>"}</Code> and the matching regions are masked in screen recordings,
             screenshots and DOM captures.
            <Code>{'<input type="password">'}</Code> is masked automatically.
          </p>
          <pre className="max-w-full overflow-x-auto rounded bg-[var(--color-space-void)] p-4 font-mono text-[12px] leading-relaxed text-[var(--color-star-300)]">
{`<QuadProvider
  apiKey={process.env.NEXT_PUBLIC_QUAD_KEY!}
  options={{
    mask: [
      '[data-pii]',
      '.user-email',
      'input[name=card]',
    ],
  }}
>`}
          </pre>
        </Surface>
      </section>

      <section>
        <h2 className="text-xs uppercase tracking-wide text-[var(--color-star-500)] mb-3">
          Automatic protections
        </h2>
        <Surface className="text-sm text-[var(--color-star-300)] space-y-2">
          <p>• Network captures strip the <Code>Authorization</Code>, <Code>Cookie</Code> headers</p>
          <p>• URL username/password are stripped automatically</p>
          <p>• `input` events record only selector + length — <strong>values are never captured</strong></p>
          <p>• Host cookies / localStorage are never collected</p>
          <p>• Object storage is private only — every access is a short-lived (5–10 min) presigned URL</p>
        </Surface>
      </section>

      <section>
        <h2 className="text-xs uppercase tracking-wide text-[var(--color-star-500)] mb-3">
          Data retention
        </h2>
        <Surface>
          <div className="max-w-full overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="text-xs uppercase tracking-wide text-[var(--color-star-500)]">
                <tr>
                  <th className="text-left py-2">Data</th>
                  <th className="text-left">Hot</th>
                  <th className="text-left">Archive</th>
                </tr>
              </thead>
              <tbody className="text-[var(--color-star-300)]">
                <Row d="Bug metadata + comments" h="forever" a="—" />
                <Row d="Video" h="30d" a="1y cold → deleted" />
                <Row d="Audio" h="30d" a="1y cold → deleted" />
                <Row d="Transcript text" h="forever" a="—" />
                <Row d="Screenshots / keyframes" h="90d" a="Delete" />
                <Row d="Task Brief (frozen)" h="forever" a="—" />
                <Row d="Resolved bug attachments" h="90d" a="Delete" />
              </tbody>
            </table>
          </div>
          <p className="text-xs text-[var(--color-star-500)] mt-3">
            Currently an instance-wide default. Per-project override is Phase 2.
          </p>
        </Surface>
      </section>

      <p className="text-xs text-[var(--color-star-500)] font-mono">
        project · {project.slug}
      </p>
    </div>
  );
}

function Row({ d, h, a }: { d: string; h: string; a: string }) {
  return (
    <tr className="border-t border-[var(--color-space-border)]">
      <td className="py-2">{d}</td>
      <td className="font-mono text-xs">{h}</td>
      <td className="font-mono text-xs">{a}</td>
    </tr>
  );
}
