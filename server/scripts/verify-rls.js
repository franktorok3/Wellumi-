const assert = require('assert');
const fs = require('fs');
const path = require('path');

const docs = fs.readFileSync(path.join(__dirname, '../docs/RLS_WRITE_PATHS.md'), 'utf8');
const migration006 = fs.readFileSync(path.join(__dirname, '../migrations/006_accounts_and_preferences.sql'), 'utf8');
const migration003 = fs.readFileSync(path.join(__dirname, '../migrations/003_wellness_story_feed.sql'), 'utf8');
const migration001 = fs.readFileSync(path.join(__dirname, '../migrations/001_initial_schema.sql'), 'utf8');
const migration002 = fs.readFileSync(path.join(__dirname, '../migrations/002_working_mvp.sql'), 'utf8');

const requiredTables = [
  'profiles',
  'user_preferences',
  'user_interest_signals',
  'user_story_feedback',
  'user_story_matches',
  'scans',
  'analyses',
  'saved_products',
  'product_interest_profiles',
  'user_feed_refresh',
];

for (const table of requiredTables) {
  assert.match(docs, new RegExp(table), `RLS doc must mention ${table}`);
}

assert.match(docs, /user_interest_signals[\s\S]*No client writes/, 'interest signals must be server-written');
assert.match(docs, /user_story_feedback[\s\S]*POST \/stories/, 'feedback should prefer server endpoint');

assert.match(migration006, /user_preferences_select_own/);
assert.match(migration006, /user_interest_signals_select_own/);
assert.match(migration006, /user_story_feedback_select_own/);
assert.match(migration003, /user_story_matches_select_own/);
assert.match(migration003, /product_interest_profiles_select_own/);
assert.match(migration002, /user_feed_refresh_select_own/);
assert.match(migration001, /profiles_select_own/);
assert.match(migration001, /scans_select_own/);
assert.match(migration001, /analyses_select_own/);
assert.match(migration001, /saved_products_select_own/);

console.log('verify-rls: all checks passed');
