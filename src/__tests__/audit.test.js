import { describe, it, expect } from 'vitest';

/**
 * Audit & Shift Calculation Logic Tests
 */
describe('Cash Audit and QR Bank Transfer Logic', () => {
  const calculateShiftAudit = (startCash, sales, orders, endCashInput) => {
    let totalCashSales = 0;
    let totalQRSales = 0;
    
    sales.forEach(s => {
      if (s.method === 'Efectivo') totalCashSales += s.total;
      if (s.method === 'QR') totalQRSales += s.total;
    });

    let totalExpenses = 0;
    orders.forEach(o => {
      totalExpenses += o.amount;
    });

    const expectedCash = startCash + totalCashSales - totalExpenses;
    const physicalCash = parseFloat(endCashInput) || 0;
    const difference = physicalCash - expectedCash;

    return {
      expectedCash,
      totalCashSales,
      totalQRSales,
      totalExpenses,
      physicalCash,
      difference
    };
  };

  it('calculates local cash balance independently from QR bank transfers', () => {
    const startCash = 100;
    const sales = [
      { method: 'Efectivo', total: 50 },
      { method: 'QR', total: 200 },
      { method: 'Efectivo', total: 30 }
    ];
    const orders = [
      { amount: 20 }
    ];
    const endCash = '160';

    const result = calculateShiftAudit(startCash, sales, orders, endCash);

    // Expected local cash = 100 (start) + 80 (cash sales) - 20 (expenses) = 160
    expect(result.expectedCash).toBe(160);
    expect(result.totalCashSales).toBe(80);
    expect(result.totalQRSales).toBe(200); // QR is tracked separately for bank audit
    expect(result.totalExpenses).toBe(20);
    expect(result.difference).toBe(0); // Perfect match
  });

  it('detects cash discrepancy (shortage / surplus) correctly', () => {
    const startCash = 50;
    const sales = [{ method: 'Efectivo', total: 100 }];
    const orders = [];
    const endCash = '140'; // Expected is 150, so shortage of -10

    const result = calculateShiftAudit(startCash, sales, orders, endCash);

    expect(result.expectedCash).toBe(150);
    expect(result.physicalCash).toBe(140);
    expect(result.difference).toBe(-10); // Shortage of Bs. 10
  });
});
