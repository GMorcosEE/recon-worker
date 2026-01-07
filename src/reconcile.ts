interface Payment {
  id: string;
  account_id: string;
  amount: string;
  currency: string;
  status: string;
}

interface ReconciliationResult {
  status: string;
  matched: boolean;
  discrepancyAmount: string | null;
  notes: string;
}

export function reconcilePayment(payment: Payment): ReconciliationResult {
  const amount = parseFloat(payment.amount);

  // Deterministic reconciliation rules
  if (amount < 0) {
    return {
      status: 'failed',
      matched: false,
      discrepancyAmount: null,
      notes: 'Negative amount not allowed',
    };
  }

  if (amount === 0) {
    return {
      status: 'failed',
      matched: false,
      discrepancyAmount: null,
      notes: 'Zero amount not allowed',
    };
  }

  // Amounts ending in .13 have a discrepancy
  const cents = Math.round((amount * 100) % 100);
  if (cents === 13) {
    return {
      status: 'completed_with_discrepancy',
      matched: false,
      discrepancyAmount: '0.13',
      notes: 'Discrepancy detected in amount',
    };
  }

  // All other amounts reconcile successfully
  return {
    status: 'completed',
    matched: true,
    discrepancyAmount: null,
    notes: 'Successfully reconciled',
  };
}
