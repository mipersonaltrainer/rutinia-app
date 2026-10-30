import { describe, it, expect, vi } from "vitest";
import { subscriptionsFor, debounce } from "@/lib/messaging/realtime";

describe("realtime subscriptions", () => {
  it("a client listens only to rows addressed to them, a trainer likewise", () => {
    const c = subscriptionsFor("client", "u1"), t = subscriptionsFor("trainer", "u2");
    expect(c.filter((s) => s.table !== "notifications").every((s) => s.filter === "client_id=eq.u1")).toBe(true);
    expect(t.filter((s) => s.table !== "notifications").every((s) => s.filter === "trainer_id=eq.u2")).toBe(true);
    expect(c.find((s) => s.table === "notifications")!.filter).toBe("user_id=eq.u1");
  });
  it("covers new messages, read receipts, call changes and notifications", () => {
    const keys = subscriptionsFor("client", "u").map((s) => `${s.table}:${s.event}`).sort();
    expect(keys).toEqual(["messages:INSERT", "messages:UPDATE", "notifications:INSERT", "video_calls:*"]);
  });
  it("debounce collapses a burst into one call and can be cancelled", () => {
    vi.useFakeTimers(); const f = vi.fn(); const d = debounce(f, 100);
    d(); d(); d(); vi.advanceTimersByTime(99); expect(f).not.toHaveBeenCalled(); vi.advanceTimersByTime(2); expect(f).toHaveBeenCalledTimes(1);
    d(); d.cancel(); vi.advanceTimersByTime(500); expect(f).toHaveBeenCalledTimes(1); vi.useRealTimers();
  });
});
