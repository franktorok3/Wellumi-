const assert = require('assert');
const { validatePreferences } = require('../src/services/profileWorkflow');
const {
  aggregateSignals,
  determineProfileStage,
  SIGNAL_WEIGHTS,
} = require('../src/services/interestSignalService');
const { DEFAULT_CONTENT_BALANCE } = require('../src/content/onboardingOptions');

const validated = validatePreferences({
  selected_interests: ['sleep', 'supplements', 'invalid'],
  selected_use_cases: ['understand_labels'],
  content_balance: { everyday_guidance: 'more', invalid: 'x' },
  limited_topics: ['weight_loss'],
});
assert.deepStrictEqual(validated.selected_interests, ['sleep', 'supplements']);
assert.strictEqual(validated.content_balance.everyday_guidance, 'more');

const aggregated = aggregateSignals([
  {
    topic: 'sleep',
    weight: 8,
    is_explicit: true,
    is_active: true,
    signal_type: 'onboarding_interest',
    source_type: 'onboarding',
  },
  {
    topic: 'hydration',
    weight: 1,
    is_explicit: false,
    is_active: true,
    signal_type: 'scan_once',
    source_type: 'scan',
  },
  {
    topic: 'weight_loss',
    weight: -20,
    is_explicit: true,
    is_active: true,
    signal_type: 'manual_limit',
    source_type: 'onboarding',
  },
]);
assert.ok(aggregated.topics.find((item) => item.topic === 'sleep'));
assert.ok(aggregated.excludedTopics.includes('weight_loss'));
assert.ok(
  aggregated.topics.find((item) => item.topic === 'sleep').finalWeight >
    aggregated.topics.find((item) => item.topic === 'hydration').finalWeight
);

const stage = determineProfileStage({
  profile: { onboarding_status: 'completed' },
  preferences: { selected_interests: ['sleep'] },
  meaningfulActions: 1,
});
assert.strictEqual(stage, 'preference_led');

assert.strictEqual(SIGNAL_WEIGHTS.scan_once, 1);
assert.ok(DEFAULT_CONTENT_BALANCE.everyday_guidance === 'balanced');

console.log('verify-accounts-preferences: all checks passed');
