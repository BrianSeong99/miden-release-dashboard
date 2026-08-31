import { ExternalLink } from "lucide-react";
import type { PioneerView } from "@/lib/types";

import { StatusBadge } from "./status-badge";

const STATUS_LABEL: Record<PioneerView["status"], string> = {
  "on-track": "On track",
  "at-risk": "At risk",
  blocked: "Blocked",
  done: "Done",
};

/** Launch-critical Pioneers — entirely manual, kept visually separate from
 * the automated repository monitoring (PRD section 5D). */
export function PioneerList({ pioneers }: { pioneers: PioneerView[] }) {
  if (pioneers.length === 0) {
    return <p className="text-sm text-muted-foreground">No Pioneers configured.</p>;
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {pioneers.map((p) => (
        <div key={p.partner} className="flex flex-col gap-2 rounded-xl border border-dashed bg-card/60 p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="font-semibold">{p.partner}</div>
            <StatusBadge tone={p.tone} label={STATUS_LABEL[p.status]} />
          </div>
          <p className="text-xs text-muted-foreground">{p.milestone}</p>
          <div className="mt-auto flex flex-col gap-1 border-t pt-2 text-xs">
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Needs</span>
              <span className="text-right">{p.releaseDependency}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Owner</span>
              <span>{p.owner}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Next decision</span>
              <span>{p.nextDecisionDate}</span>
            </div>
            {p.hubUrl && (
              <a
                href={p.hubUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 pt-1 text-brand hover:underline"
              >
                Pioneers Hub <ExternalLink aria-hidden className="size-3" />
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
