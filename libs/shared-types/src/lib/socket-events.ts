import type { CallType } from "./call";
import type { Message } from "./message";
import type { PublicUser } from "./user";

// Re-export Message so consumers can import payload + Message from one place.
export type { Message } from "./message";

// ─── Client → Server ────────────────────────────────────────────────────────
export const CLIENT_EVENTS = {
  MESSAGE_SEND: "message:send",
  MESSAGE_READ: "message:read",
  TYPING_START: "typing:start",
  TYPING_STOP: "typing:stop",
  CALL_INITIATE: "call:initiate",
  CALL_ACCEPT: "call:accept",
  CALL_REJECT: "call:reject",
  CALL_OFFER: "call:offer",
  CALL_ANSWER: "call:answer",
  CALL_ICE: "call:ice",
  CALL_END: "call:end",
} as const;
export type ClientEvent = (typeof CLIENT_EVENTS)[keyof typeof CLIENT_EVENTS];

// ─── Server → Client ────────────────────────────────────────────────────────
export const SERVER_EVENTS = {
  MESSAGE_NEW: "message:new",
  MESSAGE_DELIVERED: "message:delivered",
  MESSAGE_READ: "message:read",
  USER_ONLINE: "user:online",
  USER_OFFLINE: "user:offline",
  USER_UPDATED: "user:updated",
  TYPING_START: "typing:start",
  TYPING_STOP: "typing:stop",
  CALL_INCOMING: "call:incoming",
  CALL_ACCEPTED: "call:accepted",
  CALL_REJECTED: "call:rejected",
  CALL_OFFER: "call:offer",
  CALL_ANSWER: "call:answer",
  CALL_ICE: "call:ice",
  CALL_ENDED: "call:ended",
  ERROR: "error",
} as const;
export type ServerEvent = (typeof SERVER_EVENTS)[keyof typeof SERVER_EVENTS];

// ─── Payloads ───────────────────────────────────────────────────────────────
export interface MessageSendPayload {
  body: string;
  /** Client-generated UUID for optimistic-UI reconciliation. */
  clientId: string;
  recipientId: string;
}

export interface MessageDeliveredPayload {
  clientId: string;
  createdAt: number;
  id: string;
}

export interface MessageReadClientPayload {
  otherUserId: string;
}

export interface MessageReadServerPayload {
  readAt: number;
  readerId: string;
}

export interface TypingClientPayload {
  otherUserId: string;
}

export interface TypingServerPayload {
  fromUserId: string;
}

export interface UserOnlinePayload {
  userId: string;
}

export interface UserOfflinePayload {
  lastSeenAt: number;
  userId: string;
}

export interface CallInitiatePayload {
  callType: CallType;
  toUserId: string;
}

export interface CallIncomingPayload {
  callType: CallType;
  fromUser: PublicUser;
}

export interface CallAcceptPayload {
  fromUserId: string;
}

export interface CallRejectPayload {
  fromUserId: string;
  reason?: string;
}

/**
 * SDP/ICE are opaque to the server — relayed verbatim. Client→Server
 * carries `toUserId`; Server→Client carries `fromUserId` (server fills
 * it from `socket.data.userId` so the recipient can trust the source).
 */
export interface CallSignalClientPayload {
  candidate?: RTCIceCandidateInit;
  sdp?: RTCSessionDescriptionInit;
  toUserId: string;
}

export interface CallSignalServerPayload {
  candidate?: RTCIceCandidateInit;
  fromUserId: string;
  sdp?: RTCSessionDescriptionInit;
}

export interface CallEndPayload {
  toUserId: string;
}

export interface CallEndedPayload {
  fromUserId: string;
  reason?: "hangup" | "peer-disconnected";
}

export interface SocketErrorPayload {
  code:
    | "CALLEE_OFFLINE"
    | "INTERNAL"
    | "INVALID_PAYLOAD"
    | "TOKEN_EXPIRED"
    | "UNAUTHORIZED";
  message: string;
}

// ─── Typed event maps (used by both the api server and the web client) ─────
// These describe the socket.io payload shapes per event name so both sides
// share one source of truth. The `_` import below avoids a circular import:
// we import only types from this module.

export interface ClientToServerEvents {
  "call:accept": (payload: CallAcceptPayload) => void;
  "call:answer": (payload: CallSignalClientPayload) => void;
  "call:end": (payload: CallEndPayload) => void;
  "call:ice": (payload: CallSignalClientPayload) => void;
  "call:initiate": (payload: CallInitiatePayload) => void;
  "call:offer": (payload: CallSignalClientPayload) => void;
  "call:reject": (payload: CallRejectPayload) => void;
  "message:read": (payload: MessageReadClientPayload) => void;
  "message:send": (payload: MessageSendPayload) => void;
  "typing:start": (payload: TypingClientPayload) => void;
  "typing:stop": (payload: TypingClientPayload) => void;
}

export interface ServerToClientEvents {
  "call:accepted": (payload: CallAcceptPayload) => void;
  "call:answer": (payload: CallSignalServerPayload) => void;
  "call:ended": (payload: CallEndedPayload) => void;
  "call:ice": (payload: CallSignalServerPayload) => void;
  "call:incoming": (payload: CallIncomingPayload) => void;
  "call:offer": (payload: CallSignalServerPayload) => void;
  "call:rejected": (payload: CallRejectPayload) => void;
  error: (payload: SocketErrorPayload) => void;
  "message:delivered": (payload: MessageDeliveredPayload) => void;
  "message:new": (payload: Message) => void;
  "message:read": (payload: MessageReadServerPayload) => void;
  "typing:start": (payload: TypingServerPayload) => void;
  "typing:stop": (payload: TypingServerPayload) => void;
  "user:offline": (payload: UserOfflinePayload) => void;
  "user:online": (payload: UserOnlinePayload) => void;
  /**
   * Fired when a user is created OR their public profile changes (name,
   * avatar, bio, locale, isPro). Recipients upsert by id — for new users
   * this adds a row, for updates it replaces. PublicUser carries the
   * complete current snapshot so the client never needs a follow-up
   * fetch to reconcile.
   */
  "user:updated": (payload: PublicUser) => void;
}
