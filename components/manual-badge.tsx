// Every manually-entered value renders this badge; automated data never does.
// The dashboard must never present manual data as automatically verified
// (PRD section 6).
export function ManualBadge({ note }: { note?: string }) {
  return (
    <span
      title={note ?? "Set by hand in config — not automatically verified"}
      className="inline-flex items-center rounded-full border border-dashed border-tone-gray/40 px-2.5 py-1 text-[11px] font-medium text-tone-gray"
    >
      Manual
    </span>
  );
}
