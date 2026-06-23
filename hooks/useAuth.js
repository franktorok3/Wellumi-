import { useCallback, useEffect, useState } from 'react';
import { getCurrentUserId, initializeAuth, refreshAuthState } from '../services/auth';

export function useAuth() {
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [userId, setUserId] = useState(null);
  const [authTransitioning, setAuthTransitioning] = useState(false);

  const boot = useCallback(async () => {
    setStatus('loading');
    setError('');
    try {
      await initializeAuth();
      const id = await getCurrentUserId();
      setUserId(id);
      setStatus('ready');
    } catch (authError) {
      setError(authError?.message || 'Could not start Wellumi session.');
      setStatus('error');
    }
  }, []);

  const refresh = useCallback(async () => {
    const next = await refreshAuthState();
    setUserId(next.userId);
    setStatus('ready');
    return next;
  }, []);

  const beginTransition = useCallback(() => {
    setAuthTransitioning(true);
  }, []);

  const endTransition = useCallback(() => {
    setAuthTransitioning(false);
  }, []);

  useEffect(() => {
    boot();
  }, [boot]);

  return {
    status,
    error,
    userId,
    authTransitioning,
    retry: boot,
    refresh,
    beginTransition,
    endTransition,
    isReady: status === 'ready' && !authTransitioning,
  };
}
