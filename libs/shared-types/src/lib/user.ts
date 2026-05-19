export type Locale = "en" | "tr" | "et";

export interface User {
  avatarUrl: string | null;
  bio: string;
  createdAt: number;
  displayName: string;
  email: string;
  id: string;
  isPro: boolean;
  lastSeenAt: number | null;
  locale: Locale;
}

export type PublicUser = Omit<User, "email"> & { isOnline: boolean };
