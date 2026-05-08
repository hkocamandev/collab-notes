import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { AuthProvider, useAuth } from '../auth/AuthContext';

vi.mock('../auth/api', () => ({
  fetchMe: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
  upgradePlan: vi.fn(),
}));

vi.mock('../documents/api', () => ({
  snapshotMine: vi.fn(),
}));

import { snapshotMine } from '../documents/api';
import { fetchMe, upgradePlan } from '../auth/api';

const mockSnapshotMine = vi.mocked(snapshotMine);
const mockFetchMe = vi.mocked(fetchMe);
const mockUpgradePlan = vi.mocked(upgradePlan);

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  // Pretend we're already logged in
  sessionStorage.setItem('collab-notes:token', 'fake-token');
  mockFetchMe.mockResolvedValue({
    user: { id: 'u1', email: 'test@x.com', name: 'Test', plan: 'basic', createdAt: '' },
  });
});

function LogoutButton() {
  const { status, logout } = useAuth();
  return (
    <div>
      <span>status:{status}</span>
      <button onClick={() => void logout()}>Logout</button>
    </div>
  );
}

describe('AuthContext logout flow', () => {
  it('calls snapshotMine before clearing the token', async () => {
    mockSnapshotMine.mockResolvedValue({ snapshotsCreated: 2 });
    render(
      <AuthProvider>
        <LogoutButton />
      </AuthProvider>,
    );
    await waitFor(() => screen.getByText('status:authenticated'));

    fireEvent.click(screen.getByText('Logout'));

    await waitFor(() => expect(mockSnapshotMine).toHaveBeenCalled());
    await waitFor(() => screen.getByText('status:unauthenticated'));
    expect(sessionStorage.getItem('collab-notes:token')).toBeNull();
  });

  it('still logs out even if snapshotMine throws', async () => {
    mockSnapshotMine.mockRejectedValue(new Error('network down'));
    render(
      <AuthProvider>
        <LogoutButton />
      </AuthProvider>,
    );
    await waitFor(() => screen.getByText('status:authenticated'));

    await act(async () => {
      fireEvent.click(screen.getByText('Logout'));
    });

    await waitFor(() => screen.getByText('status:unauthenticated'));
    expect(sessionStorage.getItem('collab-notes:token')).toBeNull();
  });
});

describe('AuthContext upgrade flow', () => {
  function UpgradeButton() {
    const { user, upgrade } = useAuth();
    return (
      <div>
        <span>plan:{user?.plan ?? 'none'}</span>
        <button onClick={() => void upgrade()}>Upgrade</button>
      </div>
    );
  }

  it('switches plan to premium after upgrade', async () => {
    mockUpgradePlan.mockResolvedValue({
      user: { id: 'u1', email: 'test@x.com', name: 'Test', plan: 'premium', createdAt: '' },
    });

    render(
      <AuthProvider>
        <UpgradeButton />
      </AuthProvider>,
    );
    await waitFor(() => screen.getByText('plan:basic'));

    await act(async () => {
      fireEvent.click(screen.getByText('Upgrade'));
    });

    await waitFor(() => screen.getByText('plan:premium'));
    expect(mockUpgradePlan).toHaveBeenCalled();
  });
});
