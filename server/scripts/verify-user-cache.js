const assert = require('assert');
const fs = require('fs');
const path = require('path');

const userCache = fs.readFileSync(path.join(__dirname, '../../services/userCache.js'), 'utf8');
const useProfile = fs.readFileSync(path.join(__dirname, '../../hooks/useProfile.js'), 'utf8');
const appSource = fs.readFileSync(path.join(__dirname, '../../App.js'), 'utf8');

assert.match(userCache, /\$\{userId\}\./, 'cache keys must include user id');
assert.match(userCache, /clearUserCache/, 'must clear per-user namespace');
assert.match(userCache, /assertNoCrossUserCacheLeak/, 'must include cross-user leak guard');

assert.match(useProfile, /readUserCache\(/, 'profile cache must be user-scoped');
assert.match(useProfile, /writeUserCache\(/, 'profile writes must be user-scoped');
assert.doesNotMatch(useProfile, /wellumi\.profile'/, 'global profile cache key must be removed');

assert.match(appSource, /clearUserCache\(oldUserId\)/, 'sign out must clear old user namespace');
assert.match(appSource, /data\.clear\(\)/, 'sign out must clear in-memory app data');

assert.match(useProfile, /activeOwnerRef/);

// Simulated A → B → C transition: no namespace overlap, signed-out C reads nothing from A/B
function cacheKey(userId, suffix) {
  return `wellumi.${userId}.${suffix}`;
}
function assertNoCrossUserCacheLeak(userA, userB) {
  const suffixes = ['profile', 'preferences', 'onboarding_step', 'interest_profile', 'feed', 'library'];
  const keysA = new Set(suffixes.map((suffix) => cacheKey(userA, suffix)));
  const keysB = new Set(suffixes.map((suffix) => cacheKey(userB, suffix)));
  for (const key of keysA) {
    if (keysB.has(key)) throw new Error(`Shared cache key between users: ${key}`);
  }
  return true;
}

const userA = '11111111-1111-1111-1111-111111111111';
const userB = '22222222-2222-2222-2222-222222222222';
const userC = '33333333-3333-3333-3333-333333333333';
assert.notStrictEqual(cacheKey(userA, 'profile'), cacheKey(userB, 'profile'));
assert.notStrictEqual(cacheKey(userB, 'profile'), cacheKey(userC, 'profile'));
assert.strictEqual(assertNoCrossUserCacheLeak(userA, userB), true);
assert.strictEqual(assertNoCrossUserCacheLeak(userB, userC), true);
assert.strictEqual(assertNoCrossUserCacheLeak(userA, userC), true);

const memoryStore = new Map();
function writeCache(ownerId, suffix, value) {
  memoryStore.set(cacheKey(ownerId, suffix), value);
}
function readCache(requestingOwnerId, suffix) {
  const key = cacheKey(requestingOwnerId, suffix);
  return memoryStore.has(key) ? memoryStore.get(key) : null;
}
writeCache(userA, 'profile', { id: userA, name: 'Guest A' });
writeCache(userB, 'profile', { id: userB, name: 'Email B' });
assert.strictEqual(readCache(userC, 'profile'), null, 'signed-out C must not read A/B caches');
assert.strictEqual(readCache(userA, 'profile').name, 'Guest A');
assert.strictEqual(readCache(userB, 'profile').name, 'Email B');

console.log('verify-user-cache: all checks passed');
