import { ArrowDown, ArrowRight } from "lucide-react";
import type { ComponentStatus, RollupStatus } from "@/lib/types";
import { ComponentNode } from "./component-node";
import { DevexRollup } from "./devex-rollup";
import { StatusDot } from "./status-badge";

/** Left-to-right dependency chain: VM → Protocol → Node → SDKs → Guardian →
 * Wallet → DevEx. On md+ the chain is a fixed-card-width rail that scrolls
 * horizontally inside its own container (the page never scrolls sideways);
 * below md it stacks vertically. No graph library — the chain is fixed and
 * linear at this altitude. */
export function DependencyGraph({
  components,
  devexRollup,
}: {
  components: ComponentStatus[];
  devexRollup: RollupStatus;
}) {
  const byId = new Map(components.map((c) => [c.id, c]));
  const pick = (ids: string[]) =>
    ids.map((id) => byId.get(id)).filter((c): c is ComponentStatus => c !== undefined);
  const sdks = components.filter((c) => c.group === "sdk");
  const devex = components.filter((c) => c.group === "devex");

  const stages: React.ReactNode[] = [
    ...pick(["vm", "protocol", "node"]).map((c) => <ComponentNode key={c.id} component={c} />),
    sdks.length > 0 && (
      <div key="sdks" className="flex flex-col gap-3">
        {sdks.map((c) => (
          <ComponentNode key={c.id} component={c} />
        ))}
      </div>
    ),
    ...pick(["guardian", "wallet"]).map((c) => <ComponentNode key={c.id} component={c} />),
    <DevexRollup key="devex" rollup={devexRollup} components={devex} />,
  ].filter(Boolean);

  return (
    <section aria-label="Dependency chain" className="flex flex-col gap-3">
      <div className="overflow-x-auto pb-2">
        <div className="flex flex-col gap-2 md:min-w-max md:flex-row md:items-stretch">
          {stages.flatMap((stage, i) => [
            i > 0 && (
              <div
                key={`arrow-${i}`}
                aria-hidden
                className="flex items-center justify-center self-center text-muted-foreground"
              >
                <ArrowRight className="hidden size-4 shrink-0 md:block" />
                <ArrowDown className="size-4 shrink-0 md:hidden" />
              </div>
            ),
            <div key={`stage-${i}`} className="w-full md:w-[250px] md:shrink-0">
              {stage}
            </div>,
          ])}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="font-medium">Legend:</span>
        <span className="flex items-center gap-1.5"><StatusDot tone="green" /> compatible or released</span>
        <span className="flex items-center gap-1.5"><StatusDot tone="amber" /> migrating, RC or uncertain</span>
        <span className="flex items-center gap-1.5"><StatusDot tone="red" /> blocked</span>
        <span className="flex items-center gap-1.5"><StatusDot tone="gray" /> unknown or stale</span>
      </div>
    </section>
  );
}
