import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_PREFIX = 'wellumi.';

export const CACHE_SUFFIXES = [
  'profile',
  'preferences',
  'onboarding_step',
  'interest_profile',
  'feed',
  'library',
];

export function cacheKey(userId, suffix) {
  if (!userId) throw new Error('cacheKey requires a user id');
  return `${CACHE_PREFIX}${userId}.${suffix}`;
}

export function cacheKeysForUser(userId) {
  return CACHE_SUFFIXES.map((suffix) => cacheKey(userId, suffix));
}

export async function readUserCache(userId, suffix) {
  const raw = await AsyncStorage.getItem(cacheKey(userId, suffix));
  return raw ? JSON.parse(raw) : null;
}

export async function writeUserCache(userId, suffix, value) {
  await AsyncStorage.setItem(cacheKey(userId, suffix), JSON.stringify(value));
}

export async function clearUserCache(userId) {
  if (!userId) return;
  await AsyncStorage.multiRemove(cacheKeysForUser(userId));
}

export async function clearLegacyGlobalCache() {
  const legacyKeys = CACHE_SUFFIXES.map((suffix) => `${CACHE_PREFIX}${suffix}`);
  await AsyncStorage.multiRemove(legacyKeys);
}

export async function listAllWellumiKeys() {
  const allKeys = await AsyncStorage.getAllKeys();
  return allKeys.filter((key) => key.startsWith(CACHE_PREFIX));
}

export async function assertNoCrossUserCacheLeak(userA, userB) {
  const keysA = new Set(cacheKeysForUser(userA));
  const keysB = new Set(cacheKeysForUser(userB));
  for (const key of keysA) {
    if (keysB.has(key)) {
      throw new Error(`Shared cache key between users: ${key}`);
    }
  }
  return true;
}
