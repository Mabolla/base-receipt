const usedPaymentIds = new Set<string>();

export function hasPaymentBeenUsed(paymentId: string) {
  return usedPaymentIds.has(paymentId);
}

export function markPaymentUsed(paymentId: string) {
  usedPaymentIds.add(paymentId);
}
