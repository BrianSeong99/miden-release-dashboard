import { cn } from "@/lib/utils";
import type { Tone } from "@/lib/types";

const DOT: Record<Tone, string> = {
  green: "bg-tone-green",
  amber: "bg-tone-amber",
  red: "bg-tone-red",
  gray: "bg-tone-gray",
};

const PILL: Record<Tone, string> = {
  green: "bg-tone-green-bg text-tone-green",
  amber: "bg-tone-amber-bg text-tone-amber",
  red: "bg-tone-red-bg text-tone-red",
  gray: "bg-tone-gray-bg text-tone-gray",
};

export function StatusDot({ tone, className }: { tone: Tone; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2.5 shrink-0 rounded-full", DOT[tone], className)}
    />
  );
}

export function StatusBadge({
  tone,
  label,
  title,
}: {
  tone: Tone;
  label: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        PILL[tone],
      )}
    >
      <StatusDot tone={tone} className="size-1.5" />
      {label}
    </span>
  );
}
