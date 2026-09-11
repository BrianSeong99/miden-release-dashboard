import { act, render, screen } from "@testing-library/react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
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

  it("hydrates a fresh build hours later without replacing the server HTML", async () => {
    vi.setSystemTime(new Date("2026-08-31T12:00:00Z"));
    const element = <StaleBanner generatedAt="2026-08-31T12:00:00Z" />;
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
      expect(container.querySelector('[role="alert"]')).toHaveTextContent("288 minutes");
    } finally {
      await act(async () => root?.unmount());
      container.remove();
    }
  });

  it("continues aging while open and clears when a fresh snapshot arrives", () => {
    vi.setSystemTime(new Date("2026-08-31T12:29:00Z"));
    const { rerender } = render(<StaleBanner generatedAt="2026-08-31T12:00:00Z" />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(120_000));
    expect(screen.getByRole("alert")).toHaveTextContent("31 minutes");
    rerender(<StaleBanner generatedAt="2026-08-31T12:31:00Z" />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
