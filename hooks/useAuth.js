import { useCallback, useEffect, useState } from 'react';
import { getCurrentUserId, initializeAuth } from '../services/auth';

export function useAuth() {
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [userId, setUserId] = useState(null);

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

  useEffect(() => {
    boot();
  }, [boot]);

  return {
    status,
    error,
    userId,
    retry: boot,
    isReady: status === 'ready',
  };
}
