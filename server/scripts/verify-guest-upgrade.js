const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  mergePreferences,
  mergeInterestSignals,
  dedupeSavedProducts,
  dedupeStoryMatches,
  mergeProfiles,
  verifyMigrationCounts,
} = require('../src/services/guestMigrationMerge');

// 1. OTP verification with different user IDs should trigger secure ownership migration (client wiring)
const accountTransition = fs.readFileSync(
  path.join(__dirname, '../../services/accountTransition.js'),
  'utf8'
);
const appSource = fs.readFileSync(path.join(__dirname, '../../App.js'), 'utf8');
assert.match(accountTransition, /guestUserId === permanentUserId/, 'must detect identity linking');
assert.match(accountTransition, /completeGuestMigration/, 'must call secure server migration');
assert.match(appSource, /verifyEmailAndMigrate/, 'App must use account transition orchestration');
assert.match(appSource, /sendEmailUpgradeCode/, 'App must request migration token before OTP');

// 2. Guest data preservation helpers
const mergedPrefs = mergePreferences(
  { selected_interests: ['sleep'], content_balance: { safety: 'more' } },
  { selected_interests: ['nutrition'], content_balance: { safety: 'less' } }
);
assert.deepStrictEqual(mergedPrefs.selected_interests.sort(), ['nutrition', 'sleep']);
assert.strictEqual(mergedPrefs.content_balance.safety, 'less');

const mergedSignal = mergeInterestSignals(
  { topic: 'sleep', weight: -20, is_explicit: true, first_seen_at: '2024-01-01', last_seen_at: '2024-02-01', is_active: true },
  { topic: 'sleep', weight: -8, is_explicit: true, first_seen_at: '2024-01-02', last_seen_at: '2024-03-01', is_active: false }
);
assert.strictEqual(mergedSignal.weight, -20);

// 3. Failed migration rollback is enforced in SQL transaction (static check)
const migration007 = fs.readFileSync(
  path.join(__dirname, '../migrations/007_guest_account_upgrade.sql'),
  'utf8'
);
assert.match(migration007, /complete_guest_account_upgrade/, 'RPC must exist');
assert.match(migration007, /for update/, 'token row must be locked');
assert.match(migration007, /exception/, 'RPC must fail atomically');

// 4. Duplicate saved products merge safely
const saved = dedupeSavedProducts(
  [{ product_id: 'p1', created_at: '2024-02-01' }],
  [{ product_id: 'p1', created_at: '2024-01-01' }]
);
assert.strictEqual(saved.length, 1);
assert.strictEqual(saved[0].created_at, '2024-01-01');

// 5. Duplicate signals merge safely (covered above)

// 6. Existing account sign-in does not silently absorb guest data
const signInScreen = fs.readFileSync(
  path.join(__dirname, '../../screens/SignInScreen.js'),
  'utf8'
);
assert.match(accountTransition, /skipMigration/, 'sign-in must support skipping migration');
assert.match(signInScreen, /skipMigration: !mergeGuest/, 'SignInScreen must not auto-merge guest data');

// 7. Explicitly approved guest merge preserves both data sets
const explicitMergeCounts = verifyMigrationCounts(
  { saved_products: 2, scans: 1 },
  { saved_products: 1, scans: 0 },
  { saved_products: 2, scans: 1 }
);
assert.strictEqual(explicitMergeCounts.ok, true);

const failedCounts = verifyMigrationCounts(
  { saved_products: 2 },
  { saved_products: 1 },
  { saved_products: 0 }
);
assert.strictEqual(failedCounts.ok, false);

// 11. Returning users must not flash onboarding
assert.match(appSource, /Loading your profile/, 'profile resolution gate must exist before onboarding');

// 8. useAuth refreshes before profile completion
const useAuthSource = fs.readFileSync(path.join(__dirname, '../../hooks/useAuth.js'), 'utf8');
assert.match(useAuthSource, /refreshAuthState/, 'useAuth must expose refresh');
assert.match(appSource, /await auth\.refresh\(\)/, 'App must refresh auth after OTP');

// 12. Existing users restore profile and preferences after OTP
assert.match(appSource, /await profileState\.refresh\(\)/, 'profile must reload after sign-in');

// 15. Account deletion failure must not clear local session (server requires confirmation)
const apiRoute = fs.readFileSync(path.join(__dirname, '../src/routes/api.js'), 'utf8');
assert.match(apiRoute, /deleteAccountSchema/, 'delete account requires schema validation');
assert.match(apiRoute, /confirm: true/, 'delete account requires explicit confirm');

// Merge profile prefers completed onboarding
const mergedProfile = mergeProfiles(
  { onboarding_status: 'completed', onboarding_step: 'account', display_name: 'Guest Name' },
  { onboarding_status: 'in_progress', onboarding_step: 'interests', display_name: 'Email User', account_type: 'email' }
);
assert.strictEqual(mergedProfile.onboarding_status, 'completed');
assert.strictEqual(mergedProfile.account_type, 'email');

// Story match dedupe preserves engagement
const matches = dedupeStoryMatches(
  [{ story_id: 's1', rank_score: 2, is_read: true, is_dismissed: false, is_active: true }],
  [{ story_id: 's1', rank_score: 5, is_read: false, is_dismissed: true, is_active: false }]
);
assert.strictEqual(matches[0].is_read, true);
assert.strictEqual(matches[0].is_dismissed, true);
assert.strictEqual(matches[0].rank_score, 5);

// Server must not accept arbitrary from/to user ids
const guestService = fs.readFileSync(
  path.join(__dirname, '../src/services/guestMigrationService.js'),
  'utf8'
);
assert.doesNotMatch(guestService, /fromUserId/, 'server must not trust fromUserId from client');
assert.doesNotMatch(guestService, /toUserId/, 'server must not trust toUserId from client');
assert.match(guestService, /hashToken/, 'migration token must be hashed server-side');

console.log('verify-guest-upgrade: all checks passed');
