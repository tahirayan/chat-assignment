/** Server response for POST /api/payments/create-intent (PRD §15.2). */
export interface CreateIntentResponse {
  clientSecret: string;
  paymentIntentId: string;
}

/** Read-only status surfaced to the client after a confirm-payment redirect. */
export type PaymentStatus =
  | "succeeded"
  | "processing"
  | "requires_action"
  | "failed";

export interface PaymentStatusResponse {
  status: PaymentStatus;
}
