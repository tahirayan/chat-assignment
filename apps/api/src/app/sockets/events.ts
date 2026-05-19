export type {
  ClientToServerEvents,
  ServerToClientEvents,
} from "@chat/shared-types";

/** Per-socket data attached during the handshake. */
export interface SocketData {
  email: string;
  /** Handle of the expiry-disconnect timer so we can cancel on close. */
  expiryTimer: NodeJS.Timeout | null;
  /** JWT `exp` claim — seconds since epoch. Used to enforce session TTL. */
  tokenExp: number;
  userId: string;
}

/** No inter-server events for the demo (single-instance only). */
export type InterServerEvents = Record<string, never>;
