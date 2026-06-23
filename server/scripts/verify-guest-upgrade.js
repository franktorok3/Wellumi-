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

const accountTransition = fs.readFileSync(
  path.join(__dirname, '../../services/accountTransition.js'),
  'utf8'
);
const appSource = fs.readFileSync(path.join(__dirname, '../../App.js'), 'utf8');
const signInScreen = fs.readFileSync(path.join(__dirname, '../../screens/SignInScreen.js'), 'utf8');
const apiRoute = fs.readFileSync(path.join(__dirname, '../src/routes/api.js'), 'utf8');

assert.match(accountTransition, /verifyEmailOnly/, 'must verify OTP without implicit migration');
assert.match(accountTransition, /executeGuestMerge/, 'migration must be explicit helper');
assert.match(accountTransition, /skipGuestMerge/, 'skip path must preserve server guest rows');
assert.doesNotMatch(
  signInScreen,
  /completeGuestMigration/,
  'SignInScreen must not call migration RPC directly'
);

// OTP send must not use global auth transition (deadlock fix)
const sendCodeBlock = appSource.slice(
  appSource.indexOf('onSendCode={async (email)'),
  appSource.indexOf('onVerifyCode={async')
);
assert.doesNotMatch(sendCodeBlock, /beginTransition/, 'send code must not begin global auth transition');
assert.match(signInScreen, /sendingCode/, 'send code uses local loading state');
assert.match(signInScreen, /setStage\('verify'\)/, 'code-entry screen remains visible after send');

// Global transition reserved for verify/merge/skip hydration paths
assert.match(appSource, /onVerifyCode[\s\S]*beginTransition/, 'verify may use global transition');
assert.match(appSource, /Saving your Wellumi/, 'global transition loading copy exists');

// Existing account: no migration before explicit approval
assert.match(signInScreen, /onFetchPreview/, 'merge prompt must load preview first');
assert.match(signInScreen, /Continue without adding/, 'explicit skip action required');
assert.match(signInScreen, /Add activity/, 'explicit merge action required');
assert.match(signInScreen, /needsMerge/, 'verify pauses for merge decision');
assert.doesNotMatch(
  signInScreen,
  /onVerifyCode[\s\S]*executeGuestMerge/,
  'verify handler must not auto-merge'
);

assert.match(apiRoute, /migration-preview/, 'server exposes migration preview endpoint');
assert.match(apiRoute, /complete-migration/, 'migration endpoint remains separate');
assert.match(appSource, /pendingMerge/, 'onboarding email must pause for explicit merge choice');

// JS mirror helpers (not a substitute for RPC integration)
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

const migration007 = fs.readFileSync(
  path.join(__dirname, '../migrations/007_guest_account_upgrade.sql'),
  'utf8'
);
assert.match(migration007, /p_test_abort_at/, 'RPC supports integration abort hook');

const integrationScript = fs.readFileSync(
  path.join(__dirname, './verify-guest-migration-rpc.integration.js'),
  'utf8'
);
assert.match(integrationScript, /WELLUMI_RUN_RPC_INTEGRATION/, 'integration test is opt-in');
assert.match(integrationScript, /token must remain unconsumed on rollback/);
assert.match(integrationScript, /complete_guest_account_upgrade/);

const saved = dedupeSavedProducts(
  [{ product_id: 'p1', created_at: '2024-02-01' }],
  [{ product_id: 'p1', created_at: '2024-01-01' }]
);
assert.strictEqual(saved.length, 1);

const explicitMergeCounts = verifyMigrationCounts(
  { saved_products: 2, scans: 1 },
  { saved_products: 1, scans: 0 },
  { saved_products: 2, scans: 1 }
);
assert.strictEqual(explicitMergeCounts.ok, true);

console.log('verify-guest-upgrade: all checks passed');
