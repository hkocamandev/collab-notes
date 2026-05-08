import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProtectedRoute } from '../components/ProtectedRoute';

// react-router-dom bileşenlerini mock'luyoruz; Navigate'in happy-dom'da
// tetiklediği navigation loop'unu önlemek için.
vi.mock('react-router-dom', () => ({
  Navigate: vi.fn(() => null),
  useLocation: vi.fn(() => ({ pathname: '/', state: null, key: 'default', search: '', hash: '' })),
}));

vi.mock('../auth/AuthContext', () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from '../auth/AuthContext';
import { Navigate } from 'react-router-dom';
const mockUseAuth = vi.mocked(useAuth);
const MockNavigate = vi.mocked(Navigate);

const baseAuth = {
  user: null,
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
} as const;

describe('ProtectedRoute', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows a loading indicator while status is loading', () => {
    mockUseAuth.mockReturnValue({ ...baseAuth, status: 'loading' });

    render(
      <ProtectedRoute>
        <p>protected content</p>
      </ProtectedRoute>,
    );

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    expect(screen.queryByText('protected content')).not.toBeInTheDocument();
  });

  it('renders Navigate to /login when unauthenticated', () => {
    mockUseAuth.mockReturnValue({ ...baseAuth, status: 'unauthenticated' });

    render(
      <ProtectedRoute>
        <p>protected content</p>
      </ProtectedRoute>,
    );

    expect(MockNavigate).toHaveBeenCalledWith(
      expect.objectContaining({ to: '/login', replace: true }),
      expect.anything(),
    );
    expect(screen.queryByText('protected content')).not.toBeInTheDocument();
  });

  it('renders children when authenticated', () => {
    mockUseAuth.mockReturnValue({
      status: 'authenticated',
      user: { id: '1', email: 'user@example.com', name: 'User' },
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    });

    render(
      <ProtectedRoute>
        <p>protected content</p>
      </ProtectedRoute>,
    );

    expect(screen.getByText('protected content')).toBeInTheDocument();
  });
});
