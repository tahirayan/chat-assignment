import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";
import { useAuthStore } from "../stores/auth";

interface RetryFlag {
  _retry?: boolean;
}

export const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const token = useAuthStore().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/**
 * Single-flight refresh on 401.
 *
 * Three invariants this guards together (see auth-jwt-cookies skill):
 *   1. Excludes `/auth/*` — refreshing the refresh endpoint is recursion.
 *   2. Marks `_retry` on the original request — prevents retry loops.
 *   3. Shares a single in-flight refresh promise across concurrent 401s
 *      (no thundering herd).
 */
let refreshPromise: Promise<string | null> | null = null;

api.interceptors.response.use(undefined, async (err: AxiosError) => {
  const original = err.config as
    | (InternalAxiosRequestConfig & RetryFlag)
    | undefined;
  const status = err.response?.status;

  const shouldRefresh =
    status === 401 &&
    original !== undefined &&
    original._retry !== true &&
    !(original.url ?? "").includes("/auth/");

  if (!(shouldRefresh && original)) {
    throw err;
  }

  original._retry = true;
  const auth = useAuthStore();
  refreshPromise ??= auth.refresh().finally(() => {
    refreshPromise = null;
  });

  try {
    await refreshPromise;
    return api.request(original);
  } catch {
    await auth.logout();
    throw err;
  }
});
