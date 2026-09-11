import { act, render, screen } from "@testing-library/react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RefreshStatus } from "./refresh-status";

describe("RefreshStatus", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("shows the schedule at 10 minutes", () => {
    vi.setSystemTime(new Date("2026-08-31T12:10:00Z"));
    render(<RefreshStatus generatedAt="2026-08-31T12:00:00Z" />);
    expect(screen.getByRole("status")).toHaveTextContent("Scheduled every 15 minutes");
  });

  it("appears past 30 minutes with the age", () => {
    vi.setSystemTime(new Date("2026-08-31T12:31:00Z"));
    render(<RefreshStatus generatedAt="2026-08-31T12:00:00Z" />);
    expect(screen.getByRole("status")).toHaveTextContent("Refresh delayed · 31m old");
    expect(screen.getByRole("status")).toHaveTextContent("31 minutes old");
  });

  it("stays hidden for an unparseable timestamp", () => {
    vi.setSystemTime(new Date("2026-08-31T12:31:00Z"));
    render(<RefreshStatus generatedAt="not-a-date" />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("hydrates a fresh build hours later without replacing the server HTML", async () => {
    vi.setSystemTime(new Date("2026-08-31T12:00:00Z"));
    const element = <RefreshStatus generatedAt="2026-08-31T12:00:00Z" />;
    const container = document.createElement("div");
    container.innerHTML = renderToString(element);
    document.body.appendChild(container);
    vi.setSystemTime(new Date("2026-08-31T16:48:00Z"));
    const onRecoverableError = vi.fn();
    let root: Root | undefined;
    try {
      await act(async () => {
        root = hydrateRoot(container, element, { onRecoverableError });
      });
      expect(onRecoverableError).not.toHaveBeenCalled();
      expect(container.querySelector('[role="status"]')).toHaveTextContent("Refresh delayed · 288m old");
    } finally {
      await act(async () => root?.unmount());
      container.remove();
    }
  });

  it("continues aging while open and clears when a fresh snapshot arrives", () => {
    vi.setSystemTime(new Date("2026-08-31T12:29:00Z"));
    const { rerender } = render(<RefreshStatus generatedAt="2026-08-31T12:00:00Z" />);
    expect(screen.getByRole("status")).toHaveTextContent("Scheduled every 15 minutes");
    act(() => vi.advanceTimersByTime(120_000));
    expect(screen.getByRole("status")).toHaveTextContent("Refresh delayed · 31m old");
    rerender(<RefreshStatus generatedAt="2026-08-31T12:31:00Z" />);
    expect(screen.getByRole("status")).toHaveTextContent("Scheduled every 15 minutes");
  });
});
