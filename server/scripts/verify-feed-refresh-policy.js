const assert = require('assert');
const {
  hasSuccessfulProvider,
  isCompleteProviderFailure,
} = require('../src/utils/feedRefreshPolicy');

assert.strictEqual(
  hasSuccessfulProvider([
    { name: 'openfda_food', success: false, candidateCount: 0 },
    { name: 'pubmed', success: true, candidateCount: 0 },
  ]),
  true,
  'zero-match successful provider still counts as success'
);

assert.strictEqual(
  isCompleteProviderFailure([
    { name: 'openfda_food', success: false, candidateCount: 0 },
    { name: 'pubmed', success: false, candidateCount: 0 },
  ]),
  true
);

assert.strictEqual(
  isCompleteProviderFailure([
    { name: 'openfda_food', success: true, candidateCount: 0 },
    { name: 'pubmed', success: false, candidateCount: 0 },
  ]),
  false,
  'partial success is not a complete failure'
);

let markRefreshedCalls = 0;
function markFeedRefreshed() {
  markRefreshedCalls += 1;
}

function simulateRefresh(providerResults) {
  markRefreshedCalls = 0;
  if (isCompleteProviderFailure(providerResults)) {
    return { refreshed: false, markRefreshedCalls };
  }
  if (hasSuccessfulProvider(providerResults)) {
    markFeedRefreshed();
  }
  return { refreshed: true, markRefreshedCalls };
}

const totalFailure = simulateRefresh([
  { success: false, candidateCount: 0 },
  { success: false, candidateCount: 0 },
]);
assert.strictEqual(totalFailure.refreshed, false);
assert.strictEqual(totalFailure.markRefreshedCalls, 0);

const zeroMatchSuccess = simulateRefresh([{ success: true, candidateCount: 0 }]);
assert.strictEqual(zeroMatchSuccess.refreshed, true);
assert.strictEqual(zeroMatchSuccess.markRefreshedCalls, 1);

console.log('verify-feed-refresh-policy: all checks passed');
