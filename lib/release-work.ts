import type { BlockerView } from "./types";

export const isOpenWork = (item: BlockerView) =>
  item.live.state === "open" || item.live.state === "unknown";

export const isCriticalReleaseBlocker = (item: BlockerView) =>
  item.category === "blocker" && item.severity === "critical" && isOpenWork(item);
