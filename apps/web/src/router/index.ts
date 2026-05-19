import {
  createRouter,
  createWebHistory,
  type RouteRecordRaw,
} from "vue-router";
import { useAuthStore } from "../stores/auth";

declare module "vue-router" {
  interface RouteMeta {
    /** Which top-level layout component to render. */
    layout: "auth" | "app";
    /** Redirects to /auth when authStore.isAuthenticated is false. */
    requiresAuth?: boolean;
    /** Redirects to / when already authenticated (prevents /auth visits). */
    requiresGuest?: boolean;
  }
}

const routes: RouteRecordRaw[] = [
  {
    path: "/auth",
    name: "auth",
    component: () => import("../pages/AuthView.vue"),
    meta: { layout: "auth", requiresGuest: true },
  },
  {
    // Home — center column shows an empty-state placeholder ("select a
    // conversation"). The chats list is the permanent left pane in the
    // new 3-column layout, so it doesn't need its own route any more.
    path: "/",
    name: "chats",
    component: () => import("../pages/HomeView.vue"),
    meta: { layout: "app", requiresAuth: true },
  },
  {
    path: "/chat/:userId",
    name: "chat",
    component: () => import("../pages/ChatView.vue"),
    meta: { layout: "app", requiresAuth: true },
  },
  {
    path: "/profile",
    name: "profile",
    component: () => import("../pages/ProfileView.vue"),
    meta: { layout: "app", requiresAuth: true },
  },
  {
    path: "/upgrade",
    name: "upgrade",
    component: () => import("../pages/UpgradeView.vue"),
    meta: { layout: "app", requiresAuth: true },
  },
  // Community is now a permanent pane on the right, not a destination
  // — preserve any old bookmarks by redirecting to home.
  { path: "/community", redirect: "/" },
  { path: "/:catchAll(.*)", redirect: "/" },
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  if (auth.isBootstrapping) {
    // bootstrap was kicked off by main.ts; wait for it to finish before
    // making auth decisions on the first navigation.
    await new Promise<void>((resolve) => {
      const unwatch = auth.$subscribe(() => {
        if (!auth.isBootstrapping) {
          unwatch();
          resolve();
        }
      });
    });
  }

  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { name: "auth" };
  }
  if (to.meta.requiresGuest && auth.isAuthenticated) {
    return { name: "chats" };
  }
  return true;
});

export default router;
