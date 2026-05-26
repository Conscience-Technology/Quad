"use client";

import { useState } from "react";
import { BugColumnView } from "../bug-column-view";

export function ResolvedView({
  projectId,
  projectSlug,
}: {
  projectId: string;
  projectSlug: string;
}) {
  const [view, setView] = useState<"resolved" | "wont_do">("resolved");
  return (
    <div className="space-y-4">
      <div className="flex gap-2 text-xs">
        <button
          onClick={() => setView("resolved")}
          className={`px-3 py-1 rounded transition-colors ${
            view === "resolved"
              ? "text-[var(--color-nebula-violet)]"
              : "text-[var(--color-star-500)] hover:text-[var(--color-star-100)]"
          }`}
        >
          resolved
        </button>
        <button
          onClick={() => setView("wont_do")}
          className={`px-3 py-1 rounded transition-colors ${
            view === "wont_do"
              ? "text-[var(--color-nebula-violet)]"
              : "text-[var(--color-star-500)] hover:text-[var(--color-star-100)]"
          }`}
        >
          won't do
        </button>
      </div>
      <BugColumnView
        key={view}
        projectId={projectId}
        projectSlug={projectSlug}
        status={view}
        title={view === "resolved" ? "Resolved" : "Won't do"}
        hint={
          view === "resolved"
            ? "Bugs whose fix has merged. Tasks marked done auto-resolve."
            : "Bugs you decided not to fix."
        }
      />
    </div>
  );
}
