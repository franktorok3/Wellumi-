const assert = require('assert');
const fs = require('fs');
const path = require('path');

const migration005 = fs.readFileSync(
  path.join(__dirname, '../migrations/005_feed_lifecycle.sql'),
  'utf8'
);
const evergreen = fs.readFileSync(
  path.join(__dirname, '../src/content/evergreenGuidance.js'),
  'utf8'
);

// 13. Unverified curated records have verified_at = null
assert.match(migration005, /verified_at = null/, 'migration 005 must not fabricate verified_at');
assert.match(migration005, /verification_status = 'unverified_migrated'/, 'migrated evergreen must be unverified');

// 14. Only genuinely verified sources are marked verified in runtime seeding
assert.match(evergreen, /verified_at: null/, 'evergreen seed must not set verified_at');
assert.match(evergreen, /verification_status: 'unverified_migrated'/);
assert.doesNotMatch(evergreen, /verification_status: 'verified'/, 'evergreen seeder must not mark verified');

console.log('verify-source-metadata: all checks passed');
