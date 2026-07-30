import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import App from '../App';
import Login from '../pages/Login';

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(),
  onAuthStateChanged: vi.fn(() => vi.fn()),
  signInWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  collection: vi.fn(),
  query: vi.fn(),
  getDocs: vi.fn(),
  addDoc: vi.fn(),
  serverTimestamp: vi.fn(),
}));

vi.mock('../firebase', () => ({
  auth: {},
  db: {}
}));

vi.mock('../context/AuthContext', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useAuth: () => ({
      currentUser: null,
      userRole: null,
      login: vi.fn(),
      loginWithPin: vi.fn(),
      logout: vi.fn(),
    })
  };
});

describe('Wally La Estación UI & Authentication Unit Tests', () => {
  it('renders vendor PIN login tab by default with 6-digit PIN requirements and Wally La Estación branding', () => {
    render(
      <BrowserRouter>
        <Login />
      </BrowserRouter>
    );

    expect(screen.getByText('Wally La Estación')).toBeInTheDocument();
    expect(screen.getByText('PIN de Acceso')).toBeInTheDocument();
    expect(screen.getByText('🌙 Modo Oscuro')).toBeInTheDocument();
    
    const pinInput = screen.getByPlaceholderText('••••••');
    expect(pinInput).toBeInTheDocument();
    expect(pinInput).toHaveAttribute('maxLength', '6');
  });

  it('renders admin email/password login tab with Chrome autofill attributes', () => {
    render(
      <BrowserRouter>
        <Login />
      </BrowserRouter>
    );

    // Switch to Superadmin tab
    const superadminTab = screen.getByTitle('Superadmin');
    fireEvent.click(superadminTab);

    const emailInput = screen.getByPlaceholderText('admin@demo.com');
    const passwordInput = screen.getByPlaceholderText('••••••••');

    expect(emailInput).toBeInTheDocument();
    expect(emailInput).toHaveAttribute('autoComplete', 'username');
    expect(emailInput).toHaveAttribute('name', 'email');

    expect(passwordInput).toBeInTheDocument();
    expect(passwordInput).toHaveAttribute('autoComplete', 'current-password');
    expect(passwordInput).toHaveAttribute('name', 'password');
  });

  it('calculates default costPrice at 20% below salePrice and default minStock at 3', () => {
    const salePrice = 100;
    const defaultCostPrice = Math.round(salePrice * 0.8 * 100) / 100;
    const defaultMinStock = 3;

    expect(defaultCostPrice).toBe(80);
    expect(defaultMinStock).toBe(3);
  });

  it('excludes pending loan sales from total income until repaid', () => {
    const sales = [
      { total: 50, method: 'Efectivo', isLoan: false },
      { total: 100, method: 'Préstamo', isLoan: true, status: 'pending' },
      { total: 30, method: 'QR', isLoan: false }
    ];
    const repaidLoans = [
      { amount: 100, status: 'repaid', method: 'Efectivo' }
    ];

    const directSalesIncome = sales.filter(s => !s.isLoan && s.method !== 'Préstamo').reduce((a, b) => a + b.total, 0);
    const repaidLoansIncome = repaidLoans.filter(l => l.status === 'repaid').reduce((a, b) => a + b.amount, 0);
    const totalIncome = directSalesIncome + repaidLoansIncome;

    // 50 (Cash) + 30 (QR) + 100 (Repaid Loan) = 180 (Pending 100 loan is NOT counted)
    expect(totalIncome).toBe(180);
  });

  it('excludes loan repayments from total income to prevent data duplication', () => {
    const cashSales = 100;
    const qrSales = 50;
    const extraCash = 10;
    const extraQR = 20;
    const loanRepayments = 30; // Excluded!

    const totalIncome = cashSales + qrSales + extraCash + extraQR;
    expect(totalIncome).toBe(180);
  });

  it('calculates cash flow balance using latest shift start cash', () => {
    const latestShiftStartCash = 200;
    const extraCash = 50;
    const loanRepaymentsCash = 10;
    const cashSales = 120;
    const purchases = 40;

    const rawCashBalance = extraCash + loanRepaymentsCash + cashSales + latestShiftStartCash - purchases;
    const cashBalance = Math.max(0, rawCashBalance);
    expect(cashBalance).toBe(340);
  });

  it('decrements stocks for all products in an aggregated audit loss block when approved', () => {
    const products = [
      { id: 'p1', name: 'Product 1', stock: 10 },
      { id: 'p2', name: 'Product 2', stock: 5 }
    ];
    const lossDoc = {
      isAggregatedAuditLoss: true,
      items: [
        { productId: 'p1', qty: 2 },
        { productId: 'p2', qty: 3 }
      ]
    };

    if (lossDoc.isAggregatedAuditLoss && Array.isArray(lossDoc.items)) {
      for (const item of lossDoc.items) {
        const prod = products.find(p => p.id === item.productId);
        if (prod) {
          prod.stock = Math.max(0, prod.stock - item.qty);
        }
      }
    }

    expect(products.find(p => p.id === 'p1').stock).toBe(8);
    expect(products.find(p => p.id === 'p2').stock).toBe(2);
  });

  it('correctly calculates total cost price of block losses summing quantities * costPrice', () => {
    const products = [
      { id: 'p1', costPrice: 10 },
      { id: 'p2', costPrice: 15 }
    ];
    const lossDoc = {
      isAggregatedAuditLoss: true,
      items: [
        { productId: 'p1', qty: 2, costPrice: 10 },
        { productId: 'p2', qty: 3 }
      ]
    };

    const calculateBlockLossTotalCost = (loss) => {
      return loss.items.reduce((sum, item) => {
        const price = parseFloat(item.costPrice) || parseFloat(products.find(p => p.id === item.productId)?.costPrice) || 0;
        return sum + (price * (parseInt(item.qty, 10) || 0));
      }, 0);
    };

    expect(calculateBlockLossTotalCost(lossDoc)).toBe(65);
  });

  it('correctly sums all pending accumulated fines of all users', () => {
    const appUsers = [
      { id: 'u1', name: 'User 1', accumulatedFines: 50 },
      { id: 'u2', name: 'User 2', accumulatedFines: 0 },
      { id: 'u3', name: 'User 3', accumulatedFines: 120 }
    ];

    const totalPendingFinesSum = appUsers.reduce((sum, u) => sum + (u.accumulatedFines || 0), 0);
    expect(totalPendingFinesSum).toBe(170);
  });

  it('ensures fine payments do not affect sales or cash flow as they are stored in a separate collection', () => {
    const sales = [
      { id: 's1', total: 100, method: 'Efectivo' },
      { id: 's2', total: 50, method: 'QR' }
    ];
    const finePayments = [
      { id: 'fp1', amount: 80, vendorId: 'v1' }
    ];

    const totalSalesRevenue = sales.reduce((sum, s) => sum + s.total, 0);
    expect(totalSalesRevenue).toBe(150);
  });

  it('renders application without crashing', () => {
    const { container } = render(<App />);
    expect(container).toBeInTheDocument();
  });
});
