import { CircleAlert } from "lucide-react";
import { STATUS_LABEL } from "@/lib/status-engine";
import type { ComponentStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { EvidenceLink } from "./evidence-link";
import { ManualBadge } from "./manual-badge";
import { StatusBadge } from "./status-badge";

function VersionRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[13px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono">{value ?? "—"}</span>
    </div>
  );
}

export function ComponentNode({ component: c }: { component: ComponentStatus }) {
  return (
    <div
      data-testid={`component-${c.id}`}
      className={cn(
        "flex h-full w-full flex-col gap-2.5 rounded-xl border bg-card p-4",
        c.status === "unknown" && "border-dashed",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{c.label}</div>
          <a
            href={`https://github.com/${c.repo}/tree/${encodeURIComponent(c.branch)}`}
            target="_blank"
            rel="noreferrer"
            className="block truncate text-xs text-muted-foreground hover:text-brand hover:underline"
          >
            {c.repo}@{c.branch}
          </a>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <StatusBadge tone={c.tone} label={STATUS_LABEL[c.status]} title={c.reason} />
          {c.manual && <ManualBadge note={c.manualNote} />}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <VersionRow label="Expected" value={c.expectedVersion} />
        <VersionRow label="Latest stable" value={c.latestStable} />
        <VersionRow label="Latest RC" value={c.latestRc} />
      </div>

      {c.deps.length > 0 && (
        <div className="flex flex-col gap-1 border-t pt-2">
          {c.deps.map((d) => (
            <div key={d.label} className="flex items-baseline justify-between gap-2 text-xs">
              {d.url ? (
                <a
                  href={d.url}
                  target="_blank"
                  rel="noreferrer"
                  title={d.error ?? d.label}
                  className="truncate text-muted-foreground hover:text-brand hover:underline"
                >
                  {d.label}
                </a>
              ) : (
                <span className="truncate text-muted-foreground" title={d.error ?? d.label}>
                  {d.label}
                </span>
              )}
              <span
                className={cn(
                  "font-mono whitespace-nowrap",
                  d.onTarget === true && "text-tone-green",
                  d.onTarget === false && "text-tone-amber",
                  d.onTarget === null && "text-tone-gray",
                )}
              >
                {d.version ?? "?"} {d.onTarget === true ? "✓" : d.onTarget === false ? "✗" : ""}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="mt-auto flex flex-col gap-1 border-t pt-2 text-xs">
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground">Owner</span>
          <span>{c.owner}</span>
        </div>
        <p className="text-muted-foreground">{c.reason}</p>
        {c.errors.length > 0 && c.status === "unknown" && (
          <p className="flex items-start gap-1 text-tone-gray">
            <CircleAlert aria-hidden className="mt-0.5 size-3 shrink-0" />
            <span className="break-words">{c.errors[0]}</span>
          </p>
        )}
        {c.evidence.length > 0 && (
          <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1">
            {c.evidence.slice(0, 3).map((e) => (
              <EvidenceLink key={e.url + e.label} label={e.label} url={e.url} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
