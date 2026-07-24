import { describe, it, expect } from 'vitest';

describe('DemoB Pago Mixto & Security Rules', () => {

  const calculateSaleSplit = (total, method, customCash) => {
    if (method === 'Efectivo') return { cashPaid: total, qrPaid: 0 };
    if (method === 'QR') return { cashPaid: 0, qrPaid: total };
    if (method === 'MIXTO') {
      const cash = parseFloat(customCash) || 0;
      const qr = Math.max(0, total - cash);
      return { cashPaid: cash, qrPaid: qr };
    }
    return { cashPaid: 0, qrPaid: 0 };
  };

  const calculateAdminCashBalance = (initialCash, cashSales, loanRepaymentsCash, extraCash, purchasesCash) => {
    const rawBalance = (initialCash || 0) + (cashSales || 0) + (loanRepaymentsCash || 0) + (extraCash || 0) - (purchasesCash || 0);
    return Math.max(0, rawBalance);
  };

  it('calculates Pago Mixto correctly for sales (e.g. Total 10: 4 Cash, 6 QR)', () => {
    const split = calculateSaleSplit(10.0, 'MIXTO', '4.0');
    expect(split.cashPaid).toBe(4.0);
    expect(split.qrPaid).toBe(6.0);
  });

  it('prevents negative cash balance in Admin Dashboard formula', () => {
    // Initial: 0, Cash sales: 5, Purchases: 20 -> Raw: -15, Clamped: 0
    const balance = calculateAdminCashBalance(0, 5.0, 0, 0, 20.0);
    expect(balance).toBe(0);
  });

  it('correctly attributes cash and QR portions for loan repayments', () => {
    const split = calculateSaleSplit(50.0, 'MIXTO', '20.0');
    expect(split.cashPaid).toBe(20.0);
    expect(split.qrPaid).toBe(30.0);

    const balance = calculateAdminCashBalance(100, 50, split.cashPaid, 0, 30);
    expect(balance).toBe(140.0); // 100 + 50 + 20 - 30 = 140
  });

});
