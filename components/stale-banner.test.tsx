import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StaleBanner } from "./stale-banner";

describe("StaleBanner", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("is hidden at 10 minutes", () => {
    vi.setSystemTime(new Date("2026-08-31T12:10:00Z"));
    render(<StaleBanner generatedAt="2026-08-31T12:00:00Z" />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("appears past 30 minutes with the age", () => {
    vi.setSystemTime(new Date("2026-08-31T12:31:00Z"));
    render(<StaleBanner generatedAt="2026-08-31T12:00:00Z" />);
    expect(screen.getByRole("alert")).toHaveTextContent("31 minutes");
  });

  it("stays hidden for an unparseable timestamp", () => {
    vi.setSystemTime(new Date("2026-08-31T12:31:00Z"));
    render(<StaleBanner generatedAt="not-a-date" />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
