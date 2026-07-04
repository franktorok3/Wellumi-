import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  completeOnboarding,
  fetchInterestProfile,
  fetchMe,
  fetchPreferences,
  saveOnboardingStep,
  startOnboarding,
  updatePreferences,
} from '../services/api';
import { PROFILE_BOOTSTRAP_TIMEOUT_MS } from '../services/config';
import {
  cacheKey,
  clearLegacyGlobalCache,
  clearUserCache,
  readUserCache,
  writeUserCache,
} from '../services/userCache';

export const PROFILE_STATES = {
  UNINITIALIZED: 'uninitialized',
  LOADING: 'loading',
  LOADED: 'loaded',
  OFFLINE_CACHED: 'offline_cached',
  ERROR: 'error',
};

function logDev(...args) {
  if (__DEV__) {
    console.log('[wellumi-profile]', ...args);
  }
}

export function useProfile({ enabled = true, userId = null } = {}) {
  const [profile, setProfile] = useState(null);
  const [preferences, setPreferences] = useState(null);
  const [interestProfile, setInterestProfile] = useState(null);
  const [profileState, setProfileState] = useState(PROFILE_STATES.UNINITIALIZED);
  const [error, setError] = useState('');
  const activeOwnerRef = useRef(userId);
  const refreshGenerationRef = useRef(0);

  useEffect(() => {
    activeOwnerRef.current = userId;
  }, [userId]);

  const isLatestRefresh = useCallback((generation, ownerId) => {
    return (
      generation === refreshGenerationRef.current &&
      activeOwnerRef.current === ownerId
    );
  }, []);

  const reset = useCallback(() => {
    refreshGenerationRef.current += 1;
    setProfile(null);
    setPreferences(null);
    setInterestProfile(null);
    setProfileState(PROFILE_STATES.UNINITIALIZED);
    setError('');
    logDev('reset', { userId: activeOwnerRef.current });
  }, []);

  const loadCachedForUser = useCallback(async (ownerId) => {
    if (!ownerId) return false;
    const [cachedProfile, cachedPreferences, cachedStep, cachedInterest] = await Promise.all([
      readUserCache(ownerId, 'profile'),
      readUserCache(ownerId, 'preferences'),
      readUserCache(ownerId, 'onboarding_step'),
      readUserCache(ownerId, 'interest_profile'),
    ]);

    if (!cachedProfile && !cachedPreferences) return false;

    if (cachedProfile) {
      setProfile(
        cachedStep && cachedProfile.onboarding_status !== 'completed'
          ? { ...cachedProfile, onboarding_step: cachedStep }
          : cachedProfile
      );
    }
    if (cachedPreferences) setPreferences(cachedPreferences);
    if (cachedInterest) setInterestProfile(cachedInterest);
    setProfileState(PROFILE_STATES.OFFLINE_CACHED);
    logDev('loaded offline cache', { ownerId });
    return true;
  }, []);

  const refresh = useCallback(
    async (explicitOwnerId) => {
      const ownerId = explicitOwnerId || activeOwnerRef.current;
      if (!enabled || !ownerId) {
        logDev('refresh skipped', { enabled, ownerId });
        return;
      }

      const generation = ++refreshGenerationRef.current;
      setProfileState(PROFILE_STATES.LOADING);
      setError('');
      logDev('refresh start', { ownerId, generation, timeoutMs: PROFILE_BOOTSTRAP_TIMEOUT_MS });

      const bootstrapTimer = setTimeout(() => {
        if (!isLatestRefresh(generation, ownerId)) return;
        logDev('refresh timed out waiting for API', { ownerId, generation });
      }, PROFILE_BOOTSTRAP_TIMEOUT_MS + 500);

      try {
        await clearLegacyGlobalCache();
        const me = await fetchMe();
        if (!isLatestRefresh(generation, ownerId)) {
          logDev('refresh aborted after /me (stale owner)', { ownerId, generation });
          return;
        }

        const prefs = await fetchPreferences();
        if (!isLatestRefresh(generation, ownerId)) {
          logDev('refresh aborted after /preferences (stale owner)', { ownerId, generation });
          return;
        }

        setProfile(me.profile);
        setPreferences(prefs);
        await writeUserCache(ownerId, 'profile', me.profile);
        await writeUserCache(ownerId, 'preferences', prefs);

        if (me.profile?.onboarding_status === 'completed') {
          const interest = await fetchInterestProfile();
          if (!isLatestRefresh(generation, ownerId)) {
            logDev('refresh aborted after /interest-profile (stale owner)', { ownerId, generation });
            return;
          }
          setInterestProfile(interest);
          await writeUserCache(ownerId, 'interest_profile', interest);
        } else if (me.profile?.onboarding_step) {
          await writeUserCache(ownerId, 'onboarding_step', me.profile.onboarding_step);
        }

        if (isLatestRefresh(generation, ownerId)) {
          setProfileState(PROFILE_STATES.LOADED);
          logDev('refresh complete', { ownerId, generation });
        }
      } catch (profileError) {
        if (!isLatestRefresh(generation, ownerId)) {
          logDev('refresh error ignored (stale owner)', { ownerId, generation, message: profileError?.message });
          return;
        }

        const message = profileError?.message || 'Could not load profile.';
        setError(message);
        logDev('refresh failed', { ownerId, generation, message });

        const usedCache = await loadCachedForUser(ownerId);
        if (isLatestRefresh(generation, ownerId)) {
          if (!usedCache) {
            setProfileState(PROFILE_STATES.ERROR);
          }
        }
      } finally {
        clearTimeout(bootstrapTimer);
      }
    },
    [enabled, isLatestRefresh, loadCachedForUser]
  );

  const beginOnboarding = useCallback(async () => {
    const started = await startOnboarding();
    setProfile(started.profile);
    if (userId) {
      await writeUserCache(userId, 'profile', started.profile);
    }
    return started.profile;
  }, [userId]);

  const persistStep = useCallback(
    async (step, draft) => {
      const saved = await saveOnboardingStep(step, draft);
      setProfile(saved.profile);
      if (draft && userId) {
        setPreferences(draft);
        await writeUserCache(userId, 'preferences', draft);
      }
      if (userId) {
        await writeUserCache(userId, 'onboarding_step', step);
        await writeUserCache(userId, 'profile', saved.profile);
      }
      return saved.profile;
    },
    [userId]
  );

  const finishOnboarding = useCallback(
    async (finalPreferences) => {
      const result = await completeOnboarding(finalPreferences);
      setProfile(result.profile);
      setPreferences(result.preferences);
      if (userId) {
        await writeUserCache(userId, 'profile', result.profile);
        await writeUserCache(userId, 'preferences', result.preferences);
        await writeUserCache(userId, 'onboarding_step', 'completed');
      }
      setProfileState(PROFILE_STATES.LOADED);
      return result;
    },
    [userId]
  );

  const savePreferences = useCallback(
    async (nextPreferences) => {
      const saved = await updatePreferences(nextPreferences);
      setPreferences(saved);
      if (userId) {
        await writeUserCache(userId, 'preferences', saved);
      }
      const interest = await fetchInterestProfile();
      setInterestProfile(interest);
      if (userId) {
        await writeUserCache(userId, 'interest_profile', interest);
      }
      return saved;
    },
    [userId]
  );

  useEffect(() => {
    reset();
  }, [userId, reset]);

  useEffect(() => {
    if (enabled && userId) {
      refresh(userId);
    }
  }, [enabled, userId, refresh]);

  const shouldShowOnboarding = useMemo(() => {
    if (!enabled || !userId) return false;
    if (profileState !== PROFILE_STATES.LOADED && profileState !== PROFILE_STATES.OFFLINE_CACHED) {
      return false;
    }
    return Boolean(profile && profile.onboarding_status !== 'completed');
  }, [enabled, userId, profileState, profile]);

  return {
    profile,
    preferences,
    interestProfile,
    profileState,
    loading: profileState === PROFILE_STATES.LOADING,
    error,
    refresh,
    reset,
    beginOnboarding,
    persistStep,
    finishOnboarding,
    savePreferences,
    shouldShowOnboarding,
    needsOnboarding: shouldShowOnboarding,
    onboardingStep: profile?.onboarding_step || 'welcome',
    isProfileResolved:
      profileState === PROFILE_STATES.LOADED || profileState === PROFILE_STATES.OFFLINE_CACHED,
  };
}

export async function clearProfileCache(userId) {
  if (userId) {
    await clearUserCache(userId);
    return;
  }
  await clearLegacyGlobalCache();
}

export { cacheKey };
