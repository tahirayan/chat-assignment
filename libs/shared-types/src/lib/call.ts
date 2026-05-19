export type CallType = "audio" | "video";

export type CallState =
  | "idle"
  | "calling"
  | "ringing"
  | "connecting"
  | "connected"
  | "ended";

export type CallEndReason =
  | "hangup"
  | "rejected"
  | "timeout"
  | "failed"
  | "busy";
