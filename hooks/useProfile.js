import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  completeOnboarding,
  fetchInterestProfile,
  fetchMe,
  fetchPreferences,
  saveOnboardingStep,
  startOnboarding,
  updatePreferences,
} from '../services/api';

const CACHE_KEYS = {
  profile: 'wellumi.profile',
  preferences: 'wellumi.preferences',
  onboardingStep: 'wellumi.onboarding_step',
  interestProfile: 'wellumi.interest_profile',
};

export function useProfile({ enabled = true } = {}) {
  const [profile, setProfile] = useState(null);
  const [preferences, setPreferences] = useState(null);
  const [interestProfile, setInterestProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadCached = useCallback(async () => {
    const [cachedProfile, cachedPreferences, cachedStep, cachedInterest] = await Promise.all([
      AsyncStorage.getItem(CACHE_KEYS.profile),
      AsyncStorage.getItem(CACHE_KEYS.preferences),
      AsyncStorage.getItem(CACHE_KEYS.onboardingStep),
      AsyncStorage.getItem(CACHE_KEYS.interestProfile),
    ]);
    if (cachedProfile) setProfile(JSON.parse(cachedProfile));
    if (cachedPreferences) setPreferences(JSON.parse(cachedPreferences));
    if (cachedStep && profile) {
      setProfile((current) => ({ ...current, onboarding_step: cachedStep }));
    }
    if (cachedInterest) setInterestProfile(JSON.parse(cachedInterest));
  }, [profile]);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError('');
    try {
      const me = await fetchMe();
      const prefs = await fetchPreferences();
      setProfile(me.profile);
      setPreferences(prefs);
      await AsyncStorage.setItem(CACHE_KEYS.profile, JSON.stringify(me.profile));
      await AsyncStorage.setItem(CACHE_KEYS.preferences, JSON.stringify(prefs));
      if (me.profile?.onboarding_status === 'completed') {
        const interest = await fetchInterestProfile();
        setInterestProfile(interest);
        await AsyncStorage.setItem(CACHE_KEYS.interestProfile, JSON.stringify(interest));
      }
    } catch (profileError) {
      setError(profileError?.message || 'Could not load profile.');
      await loadCached();
    } finally {
      setLoading(false);
    }
  }, [enabled, loadCached]);

  const beginOnboarding = useCallback(async () => {
    const started = await startOnboarding();
    setProfile(started.profile);
    return started.profile;
  }, []);

  const persistStep = useCallback(async (step, draft) => {
    const saved = await saveOnboardingStep(step, draft);
    setProfile(saved.profile);
    if (draft) {
      setPreferences(draft);
      await AsyncStorage.setItem(CACHE_KEYS.preferences, JSON.stringify(draft));
    }
    await AsyncStorage.setItem(CACHE_KEYS.onboardingStep, step);
    return saved.profile;
  }, []);

  const finishOnboarding = useCallback(async (finalPreferences) => {
    const result = await completeOnboarding(finalPreferences);
    setProfile(result.profile);
    setPreferences(result.preferences);
    await AsyncStorage.multiSet([
      [CACHE_KEYS.profile, JSON.stringify(result.profile)],
      [CACHE_KEYS.preferences, JSON.stringify(result.preferences)],
      [CACHE_KEYS.onboardingStep, 'completed'],
    ]);
    return result;
  }, []);

  const savePreferences = useCallback(async (nextPreferences) => {
    const saved = await updatePreferences(nextPreferences);
    setPreferences(saved);
    await AsyncStorage.setItem(CACHE_KEYS.preferences, JSON.stringify(saved));
    const interest = await fetchInterestProfile();
    setInterestProfile(interest);
    await AsyncStorage.setItem(CACHE_KEYS.interestProfile, JSON.stringify(interest));
    return saved;
  }, []);

  useEffect(() => {
    if (enabled) {
      refresh();
    }
  }, [enabled, refresh]);

  return {
    profile,
    preferences,
    interestProfile,
    loading,
    error,
    refresh,
    beginOnboarding,
    persistStep,
    finishOnboarding,
    savePreferences,
    needsOnboarding: profile ? profile.onboarding_status !== 'completed' : false,
    onboardingStep: profile?.onboarding_step || 'welcome',
  };
}

export async function clearProfileCache() {
  await AsyncStorage.multiRemove(Object.values(CACHE_KEYS));
}
