import type { UpdateProfileInput } from "@chat/shared-contracts";
import type { PublicUser, User } from "@chat/shared-types";
import { defineStore } from "pinia";
import { computed, ref } from "vue";
import { api } from "../api/client";

interface AuthSuccessResponse {
  accessToken: string;
  user: User;
}

interface RefreshResponse {
  accessToken: string;
}

export const useAuthStore = defineStore("auth", () => {
  const user = ref<User | null>(null);
  const accessToken = ref<string | null>(null);
  const isBootstrapping = ref(false);

  const isAuthenticated = computed(() => user.value !== null);

  function setSession(nextUser: User, token: string): void {
    user.value = nextUser;
    accessToken.value = token;
  }

  function clearSession(): void {
    user.value = null;
    accessToken.value = null;
  }

  /**
   * App-boot probe: try the refresh cookie. On success, populate session;
   * on failure (no cookie / expired / revoked) leave anon and let the route
   * guard send the user to /auth.
   */
  async function bootstrap(): Promise<void> {
    isBootstrapping.value = true;
    try {
      const { data } = await api.post<RefreshResponse>("/auth/refresh");
      accessToken.value = data.accessToken;
      const me = await api.get<User>("/auth/me");
      user.value = me.data;
    } catch {
      clearSession();
    } finally {
      isBootstrapping.value = false;
    }
  }

  async function login(email: string, password: string): Promise<void> {
    const { data } = await api.post<AuthSuccessResponse>("/auth/login", {
      email,
      password,
    });
    setSession(data.user, data.accessToken);
  }

  async function register(
    email: string,
    password: string,
    displayName: string
  ): Promise<void> {
    const { data } = await api.post<AuthSuccessResponse>("/auth/register", {
      email,
      password,
      displayName,
    });
    setSession(data.user, data.accessToken);
  }

  async function logout(): Promise<void> {
    try {
      await api.post("/auth/logout");
    } catch {
      // Even if the server call fails, clear local state — the user wants out.
    }
    // Shared-device privacy (PLAN.md Phase 19): drop the notifications
    // feed for this user so the next user signing in on the same browser
    // doesn't see prior history. Must run BEFORE clearSession() while
    // the user id is still available to scope the key.
    if (user.value && typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(`notifications:feed:${user.value.id}`);
        window.localStorage.removeItem("notifications:permission-dismissed");
      } catch {
        // Quota / privacy modes — best-effort cleanup.
      }
    }
    clearSession();
  }

  /**
   * Used by the axios interceptor's single-flight refresh path. Returns the
   * new access token on success, or null on failure (which causes the
   * interceptor to logout + rethrow).
   */
  async function refresh(): Promise<string | null> {
    try {
      const { data } = await api.post<RefreshResponse>("/auth/refresh");
      accessToken.value = data.accessToken;
      return data.accessToken;
    } catch {
      clearSession();
      return null;
    }
  }

  /**
   * Local-only patch — used after a server confirms the change, or for
   * fields the client owns (e.g. an optimistic locale flip before the
   * PATCH lands).
   */
  function patchUserLocally(patch: Partial<User>): void {
    if (user.value) {
      user.value = { ...user.value, ...patch };
    }
  }

  /**
   * PATCH /api/users/me with the given fields, then mirror the canonical
   * server response onto local state. Returns the updated User; throws on
   * api failure so the caller can surface the error.
   */
  async function updateProfile(patch: UpdateProfileInput): Promise<User> {
    const { data } = await api.patch<User>("/users/me", patch);
    user.value = data;
    return data;
  }

  /**
   * Cross-tab / cross-device sync of THIS user's public profile. Called
   * by the `user:updated` socket dispatch when the incoming payload's id
   * matches our own — picks up name/avatar/bio/locale/isPro changes
   * applied from another tab or from the Stripe webhook (Pro flip)
   * without needing a refetch. `email` stays put — PublicUser doesn't
   * carry it, and a logout-re-login is the only way it actually changes.
   */
  function mergePublicProfile(next: PublicUser): void {
    if (!user.value || user.value.id !== next.id) {
      return;
    }
    user.value = {
      ...user.value,
      displayName: next.displayName,
      bio: next.bio,
      avatarUrl: next.avatarUrl,
      locale: next.locale,
      isPro: next.isPro,
      lastSeenAt: next.lastSeenAt,
      createdAt: next.createdAt,
    };
  }

  return {
    user,
    accessToken,
    isBootstrapping,
    isAuthenticated,
    setSession,
    clearSession,
    bootstrap,
    login,
    register,
    logout,
    refresh,
    patchUserLocally,
    updateProfile,
    mergePublicProfile,
  };
});
