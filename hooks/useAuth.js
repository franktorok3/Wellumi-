import { useCallback, useEffect, useState } from 'react';
import { AUTH_INIT_TIMEOUT_MS } from '../services/config';
import { getCurrentUserId, initializeAuth, refreshAuthState } from '../services/auth';

function logDev(...args) {
  if (__DEV__) {
    console.log('[wellumi-auth-hook]', ...args);
  }
}

export function useAuth() {
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [userId, setUserId] = useState(null);
  const [authTransitioning, setAuthTransitioning] = useState(false);

  const boot = useCallback(async () => {
    setStatus('loading');
    setError('');
    logDev('boot start');
    const bootTimer = setTimeout(() => {
      logDev('boot still running after', AUTH_INIT_TIMEOUT_MS, 'ms');
    }, AUTH_INIT_TIMEOUT_MS);

    try {
      await initializeAuth();
      const id = await getCurrentUserId();
      setUserId(id);
      setStatus('ready');
      logDev('boot ready', id);
    } catch (authError) {
      logDev('boot failed', authError?.message);
      setError(authError?.message || 'Could not start Wellumi session.');
      setStatus('error');
    } finally {
      clearTimeout(bootTimer);
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
