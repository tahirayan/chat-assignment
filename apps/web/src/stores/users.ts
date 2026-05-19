import type { PublicUser } from "@chat/shared-types";
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { api } from "../api/client";

export const useUsersStore = defineStore("users", () => {
  const byId = ref<Map<string, PublicUser>>(new Map());
  const isLoading = ref(false);
  const error = ref<string | null>(null);

  const all = computed<PublicUser[]>(() =>
    Array.from(byId.value.values()).sort((a, b) =>
      a.displayName.localeCompare(b.displayName)
    )
  );

  const onlineUsers = computed<PublicUser[]>(() =>
    all.value.filter((u) => u.isOnline)
  );

  const offlineUsers = computed<PublicUser[]>(() =>
    all.value.filter((u) => !u.isOnline)
  );

  function setAll(next: PublicUser[]): void {
    const map = new Map<string, PublicUser>();
    for (const user of next) {
      map.set(user.id, user);
    }
    byId.value = map;
  }

  function upsert(user: PublicUser): void {
    byId.value.set(user.id, user);
    // Trigger reactivity (Map mutation isn't tracked deeply).
    byId.value = new Map(byId.value);
  }

  function setOnline(userId: string): void {
    const existing = byId.value.get(userId);
    if (!existing || existing.isOnline) {
      return;
    }
    byId.value.set(userId, { ...existing, isOnline: true });
    byId.value = new Map(byId.value);
  }

  function setOffline(userId: string, lastSeenAt: number): void {
    const existing = byId.value.get(userId);
    if (!existing) {
      return;
    }
    if (!existing.isOnline && existing.lastSeenAt === lastSeenAt) {
      return;
    }
    byId.value.set(userId, { ...existing, isOnline: false, lastSeenAt });
    byId.value = new Map(byId.value);
  }

  function clear(): void {
    byId.value = new Map();
    isLoading.value = false;
    error.value = null;
  }

  async function fetchAll(): Promise<void> {
    isLoading.value = true;
    error.value = null;
    try {
      const { data } = await api.get<PublicUser[]>("/users");
      setAll(data);
    } catch (err) {
      error.value = err instanceof Error ? err.message : "Failed to load users";
    } finally {
      isLoading.value = false;
    }
  }

  return {
    byId,
    all,
    onlineUsers,
    offlineUsers,
    isLoading,
    error,
    setAll,
    upsert,
    setOnline,
    setOffline,
    clear,
    fetchAll,
  };
});
