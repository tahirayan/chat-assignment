/**
 * Single-instance in-memory presence map.
 *
 *   userId  →  Set<socketId>
 *
 * • track(userId, socketId) → true if this is the user's *first* live socket
 *   (caller should broadcast `user:online`).
 * • untrack(userId, socketId) → true if this was the user's *last* live socket
 *   (caller should broadcast `user:offline` and persist `lastSeenAt`).
 *
 * "Last socket" semantics are critical: a user opening a second tab must NOT
 * re-broadcast online, and closing one of two tabs must NOT flip them offline.
 * See realtime-specialist agent's pre-flight checks.
 *
 * Multi-instance deployments would need a shared store (Redis pub/sub) instead
 * of this Map — flagged in REPORT.md as a known limitation.
 */
export class PresenceTracker {
  private readonly sockets = new Map<string, Set<string>>();

  track(userId: string, socketId: string): { firstSocket: boolean } {
    let set = this.sockets.get(userId);
    if (!set) {
      set = new Set();
      this.sockets.set(userId, set);
    }
    const firstSocket = set.size === 0;
    set.add(socketId);
    return { firstSocket };
  }

  untrack(userId: string, socketId: string): { lastSocket: boolean } {
    const set = this.sockets.get(userId);
    if (!set) {
      return { lastSocket: false };
    }
    set.delete(socketId);
    if (set.size === 0) {
      this.sockets.delete(userId);
      return { lastSocket: true };
    }
    return { lastSocket: false };
  }

  isOnline(userId: string): boolean {
    return this.sockets.has(userId);
  }

  onlineUserIds(): string[] {
    return Array.from(this.sockets.keys());
  }

  /** For tests + diagnostics. Don't rely on this in production code paths. */
  socketCount(userId: string): number {
    return this.sockets.get(userId)?.size ?? 0;
  }
}

export const presence = new PresenceTracker();
