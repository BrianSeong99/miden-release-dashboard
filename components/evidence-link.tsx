import { ExternalLink } from "lucide-react";

export function EvidenceLink({ label, url }: { label: string; url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-xs text-brand hover:underline"
    >
      {label}
      <ExternalLink aria-hidden className="size-3" />
    </a>
  );
}
