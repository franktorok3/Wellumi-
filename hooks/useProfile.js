import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  completeOnboarding,
  fetchInterestProfile,
  fetchMe,
  fetchPreferences,
  saveOnboardingStep,
  startOnboarding,
  updatePreferences,
} from '../services/api';
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

export function useProfile({ enabled = true, userId = null } = {}) {
  const [profile, setProfile] = useState(null);
  const [preferences, setPreferences] = useState(null);
  const [interestProfile, setInterestProfile] = useState(null);
  const [profileState, setProfileState] = useState(PROFILE_STATES.UNINITIALIZED);
  const [error, setError] = useState('');

  const reset = useCallback(() => {
    setProfile(null);
    setPreferences(null);
    setInterestProfile(null);
    setProfileState(PROFILE_STATES.UNINITIALIZED);
    setError('');
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
    return true;
  }, []);

  const refresh = useCallback(async () => {
    if (!enabled || !userId) return;
    setProfileState(PROFILE_STATES.LOADING);
    setError('');
    try {
      await clearLegacyGlobalCache();
      const me = await fetchMe();
      const prefs = await fetchPreferences();
      setProfile(me.profile);
      setPreferences(prefs);
      await writeUserCache(userId, 'profile', me.profile);
      await writeUserCache(userId, 'preferences', prefs);
      if (me.profile?.onboarding_status === 'completed') {
        const interest = await fetchInterestProfile();
        setInterestProfile(interest);
        await writeUserCache(userId, 'interest_profile', interest);
      } else if (me.profile?.onboarding_step) {
        await writeUserCache(userId, 'onboarding_step', me.profile.onboarding_step);
      }
      setProfileState(PROFILE_STATES.LOADED);
    } catch (profileError) {
      setError(profileError?.message || 'Could not load profile.');
      const usedCache = await loadCachedForUser(userId);
      if (!usedCache) {
        setProfileState(PROFILE_STATES.ERROR);
      }
    }
  }, [enabled, userId, loadCachedForUser]);

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
      refresh();
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
