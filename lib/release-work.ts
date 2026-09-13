import type { BlockerView } from "./types";

export const isOpenWork = (item: BlockerView) =>
  item.live.state === "open" || item.live.state === "unknown";

export const isCriticalReleaseBlocker = (item: BlockerView) =>
  item.category === "blocker" && item.gateScope !== "outcome" && item.severity === "critical" && isOpenWork(item);

/** Actions describe observed workflow state, never assume an unobserved approval. */
export function nextWorkAction(item: BlockerView): string {
  if (item.live.state === "unknown") return "Verify GitHub state";
  if (!isOpenWork(item)) return "Completed";
  if (item.handoff) return item.handoff.nextAction;
  if (item.kind !== "pull-request") return "Confirm scope and next decision";
  const w = item.workflow;
  if (!w) return "Check PR readiness";
  if (w.draft) return "Finish draft and request review";
  if (w.checks === "failing") return "Fix failing checks";
  if (w.checks === "pending") return "Wait for checks";
  if (w.reviewers.length) return "Review requested";
  return "Check review and merge readiness";
}
