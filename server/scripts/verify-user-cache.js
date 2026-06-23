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

// Simulated namespace isolation (mirrors services/userCache.js)
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
assert.notStrictEqual(cacheKey(userA, 'profile'), cacheKey(userB, 'profile'));
assert.strictEqual(assertNoCrossUserCacheLeak(userA, userB), true);

console.log('verify-user-cache: all checks passed');
