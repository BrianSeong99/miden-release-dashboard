import { render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReleaseDate } from "./release-date";

afterEach(() => vi.useRealTimers());

describe("ReleaseDate", () => {
  it("shows exact UTC and elapsed age from the supplied clock", () => {
    const { container } = render(<ReleaseDate publishedAt="2026-09-09T15:30:45+09:00" now={Date.parse("2026-09-11T09:30:45Z")} />);
    expect(screen.getByText("2026-09-09 06:30:45 UTC")).toBeInTheDocument();
    expect(screen.getByText("2d 3h ago")).toBeInTheDocument();
    expect(container.querySelector("time")).toHaveAttribute("datetime", "2026-09-09T15:30:45+09:00");
  });

  it.each([null, "not-a-date", "2026-09-09T06:30:45", "2026-13-09T06:30:45Z", "2026-02-30T06:30:45Z", "2026-09-12T00:00:00Z"])(
    "does not represent invalid or future timestamp %s as a publication", (publishedAt) => {
      const { container } = render(<ReleaseDate publishedAt={publishedAt} now={Date.parse("2026-09-11T00:00:00Z")} />);
      expect(screen.getByText("Unknown")).toBeInTheDocument();
      expect(container.querySelector("time")).toBeNull();
    },
  );

  it("renders deterministically without reading the local clock", () => {
    vi.useFakeTimers();
    const element = <ReleaseDate publishedAt="2026-09-09T06:30:45Z" />;
    vi.setSystemTime(new Date("2026-09-09T07:00:00Z"));
    const first = renderToString(element);
    vi.setSystemTime(new Date("2026-09-12T07:00:00Z"));
    expect(renderToString(element)).toBe(first);
    expect(first).toContain("2026-09-09 06:30:45 UTC");
    expect(first).not.toContain("ago");
  });

  it("can omit age while retaining the exact timestamp in compact mode", () => {
    render(<ReleaseDate publishedAt="2026-09-09T06:30:45Z" now={Date.parse("2026-09-11T00:00:00Z")} compact showAge={false} />);
    expect(screen.getByText("2026-09-09 06:30:45 UTC")).toBeInTheDocument();
    expect(screen.queryByText(/ago/)).not.toBeInTheDocument();
  });
});
