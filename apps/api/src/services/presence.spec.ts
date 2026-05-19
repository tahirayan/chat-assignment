import { beforeEach, describe, expect, it } from "vitest";
import { PresenceTracker } from "./presence";

describe("PresenceTracker", () => {
  let tracker: PresenceTracker;

  beforeEach(() => {
    tracker = new PresenceTracker();
  });

  it("first track returns firstSocket=true", () => {
    expect(tracker.track("u1", "s1")).toEqual({ firstSocket: true });
    expect(tracker.isOnline("u1")).toBe(true);
  });

  it("second tab for same user returns firstSocket=false (no double-broadcast)", () => {
    tracker.track("u1", "s1");
    expect(tracker.track("u1", "s2")).toEqual({ firstSocket: false });
    expect(tracker.socketCount("u1")).toBe(2);
  });

  it("untracking one of two tabs returns lastSocket=false (still online)", () => {
    tracker.track("u1", "s1");
    tracker.track("u1", "s2");
    expect(tracker.untrack("u1", "s1")).toEqual({ lastSocket: false });
    expect(tracker.isOnline("u1")).toBe(true);
    expect(tracker.socketCount("u1")).toBe(1);
  });

  it("untracking the last tab returns lastSocket=true (now offline)", () => {
    tracker.track("u1", "s1");
    expect(tracker.untrack("u1", "s1")).toEqual({ lastSocket: true });
    expect(tracker.isOnline("u1")).toBe(false);
    expect(tracker.socketCount("u1")).toBe(0);
  });

  it("untracking an unknown user is a no-op", () => {
    expect(tracker.untrack("u-ghost", "s-ghost")).toEqual({
      lastSocket: false,
    });
  });

  it("onlineUserIds returns every tracked user", () => {
    tracker.track("u1", "s1");
    tracker.track("u2", "s2");
    tracker.track("u1", "s3");
    expect(tracker.onlineUserIds().sort()).toEqual(["u1", "u2"]);
  });

  it("tracking a duplicate socket id doesn't re-broadcast", () => {
    tracker.track("u1", "s1");
    expect(tracker.track("u1", "s1")).toEqual({ firstSocket: false });
    expect(tracker.socketCount("u1")).toBe(1);
  });
});
