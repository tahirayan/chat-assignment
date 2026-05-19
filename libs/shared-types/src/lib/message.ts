export interface Message {
  body: string;
  createdAt: number;
  id: string;
  readAt: number | null;
  recipientId: string;
  senderId: string;
}
