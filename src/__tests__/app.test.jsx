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

describe('DemoB UI & Authentication Unit Tests', () => {
  it('renders vendor PIN login tab by default with 6-digit PIN requirements', () => {
    render(
      <BrowserRouter>
        <Login />
      </BrowserRouter>
    );

    expect(screen.getByText('Demo B POS')).toBeInTheDocument();
    expect(screen.getByText('PIN de Acceso')).toBeInTheDocument();
    
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
    const adminTab = screen.getByText('Administrador');
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

  it('renders application without crashing', () => {
    const { container } = render(<App />);
    expect(container).toBeInTheDocument();
  });
});
