import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import App from '../App';
import Login from '../pages/Login';
import { AuthProvider } from '../context/AuthContext';

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(),
  onAuthStateChanged: vi.fn(() => vi.fn()), // returns unsubscribe function
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

// Mock AuthContext
vi.mock('../context/AuthContext', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useAuth: () => ({
      currentUser: null,
      userRole: null,
      login: vi.fn(),
      logout: vi.fn(),
    })
  };
});

describe('DemoB Basic Rendering Tests', () => {
  it('renders login page correctly when unauthenticated', () => {
    render(
      <BrowserRouter>
        <Login />
      </BrowserRouter>
    );
    expect(screen.getByText('DemoB')).toBeInTheDocument();
    expect(screen.getByText('Sistema de Ventas e Inventarios')).toBeInTheDocument();
    expect(screen.getByLabelText('Correo Electrónico')).toBeInTheDocument();
    expect(screen.getByLabelText('Contraseña')).toBeInTheDocument();
  });
  
  it('renders application without crashing', () => {
    const { container } = render(<App />);
    expect(container).toBeInTheDocument();
  });
});
