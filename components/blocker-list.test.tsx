import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { BlockerView } from "@/lib/types";
import { BlockerList } from "./blocker-list";

const at = "2026-08-31T12:00:00Z";
const blocker = (over: Partial<BlockerView>): BlockerView => ({
  id: "b1",
  title: "Fee drain",
  severity: "critical",
  stage: "protocol",
  owner: "mmagician",
  exitCondition: "fix merged",
  nextDecisionDate: "2026-09-03",
  url: "https://github.com/0xMiden/protocol/issues/3763",
  live: { state: "open", checkedAt: at },
  ...over,
});

describe("BlockerList", () => {
  it("renders severity, live state and owner", () => {
    render(<BlockerList blockers={[blocker({})]} today="2026-08-31" />);
    expect(screen.getByText("critical")).toBeInTheDocument();
    expect(screen.getByText("Open")).toBeInTheDocument();
    expect(screen.getByText("mmagician")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Fee drain" })).toHaveAttribute(
      "href",
      "https://github.com/0xMiden/protocol/issues/3763",
    );
  });

  it("marks past-due decision dates", () => {
    render(
      <BlockerList
        blockers={[blocker({ nextDecisionDate: "2026-08-01" }), blocker({ id: "b2", nextDecisionDate: "2026-09-30" })]}
        today="2026-08-31"
      />,
    );
    expect(screen.getByText("2026-08-01")).toHaveClass("text-tone-red");
    expect(screen.getByText("2026-09-30")).not.toHaveClass("text-tone-red");
  });

  it("shows merged and unknown live states", () => {
    render(
      <BlockerList
        blockers={[
          blocker({ id: "m", live: { state: "merged", checkedAt: at } }),
          blocker({ id: "u", live: { state: "unknown", error: "timeout", checkedAt: at } }),
        ]}
        today="2026-08-31"
      />,
    );
    expect(screen.getByText("Merged")).toBeInTheDocument();
    expect(screen.getByText("Unknown")).toHaveAttribute("title", "timeout");
  });

  it("renders an empty state", () => {
    render(<BlockerList blockers={[]} today="2026-08-31" />);
    expect(screen.getByText(/No critical blockers/)).toBeInTheDocument();
  });
});
