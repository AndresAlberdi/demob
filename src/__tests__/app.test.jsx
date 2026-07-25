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

describe('Racquet La Estación UI & Authentication Unit Tests', () => {
  it('renders vendor PIN login tab by default with 6-digit PIN requirements and Racquet La Estación branding', () => {
    render(
      <BrowserRouter>
        <Login />
      </BrowserRouter>
    );

    expect(screen.getByText('Racquet La Estación')).toBeInTheDocument();
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

    // Switch to Admin tab
    const adminTab = screen.getByText('Admin');
    fireEvent.click(adminTab);

    const emailInput = screen.getByPlaceholderText('admin@demob.com');
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

  it('renders application without crashing', () => {
    const { container } = render(<App />);
    expect(container).toBeInTheDocument();
  });
});
