/**
 * Socket.io room helpers. Centralising the room key prevents drift when
 * the format changes — every emit / disconnect references the same
 * builder.
 */
export function userRoom(userId: string): string {
  return `user:${userId}`;
}
