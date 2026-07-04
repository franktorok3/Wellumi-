const FILLER_PHRASES = [
  'products like this',
  'routine wellness habits',
  'wellumi turns source updates',
  'this story connects to everyday topics',
  'a general wellumi wellness story',
  'people often use products like this',
  'product labels often highlight ingredients, serving information, and marketing phrases',
  'the sources below discuss this topic without turning the item into medical advice',
  'consumer products and labels can change, and individual needs vary',
  'what does this label actually list? does this product overlap',
  'a safety update worth knowing about',
  'what x means in everyday wellness',
  'worth knowing about',
];

const GENERIC_TITLE_PATTERNS = [
  /^a general wellumi/i,
  /^a grounded wellness story/i,
  /^what .+ means in everyday wellness$/i,
  /^a safety update worth knowing about/i,
];

function containsFiller(text) {
  const haystack = String(text || '').toLowerCase();
  return FILLER_PHRASES.some((phrase) => haystack.includes(phrase));
}

function countGroundedSections(sections = {}) {
  const allowed = [
    'why_this_matters_now',
    'everyday_explanation',
    'what_reliable_sources_say',
    'what_product_labels_commonly_say',
    'what_to_check_on_the_label',
    'what_people_commonly_use_it_for',
    'what_remains_uncertain',
    'questions_worth_asking',
  ];
  return allowed.filter((key) => {
    const value = sections[key];
    return value && String(value).trim().length >= 24 && !containsFiller(value);
  }).length;
}

function isSpecificTitle(title) {
  const normalized = String(title || '').trim();
  if (!normalized || normalized.length < 16) return false;
  return !GENERIC_TITLE_PATTERNS.some((pattern) => pattern.test(normalized));
}

function isUsefulDeck(deck) {
  const normalized = String(deck || '').trim();
  if (!normalized || normalized.length < 20) return false;
  return !containsFiller(normalized);
}

function acceptsStoryForDisplay({
  generated,
  sourceRecords = [],
  storyCategory,
  safetyContext = null,
}) {
  if (!sourceRecords.length) {
    return { accepted: false, reason: 'no_sources' };
  }
  if (!isSpecificTitle(generated?.title)) {
    return { accepted: false, reason: 'generic_title' };
  }
  if (!isUsefulDeck(generated?.deck)) {
    return { accepted: false, reason: 'weak_deck' };
  }
  if (containsFiller(generated?.title) || containsFiller(generated?.deck)) {
    return { accepted: false, reason: 'filler_copy' };
  }

  const groundedSections = countGroundedSections(generated?.sections || {});
  const minSections = generated?.generation_mode === 'fallback' ? 2 : 2;
  if (groundedSections < minSections) {
    return { accepted: false, reason: 'insufficient_grounded_sections' };
  }

  if (storyCategory === 'safety_and_recalls' && safetyContext && !safetyContext.displayEligible) {
    return { accepted: false, reason: safetyContext.reason || 'safety_not_eligible' };
  }

  for (const value of Object.values(generated?.sections || {})) {
    if (containsFiller(value)) {
      return { accepted: false, reason: 'filler_section' };
    }
  }

  return { accepted: true };
}

function pruneEmptySections(sections = {}) {
  const pruned = {};
  for (const [key, value] of Object.entries(sections)) {
    if (!value || !String(value).trim()) continue;
    if (containsFiller(value)) continue;
    pruned[key] = String(value).trim();
  }
  return pruned;
}

module.exports = {
  FILLER_PHRASES,
  containsFiller,
  countGroundedSections,
  isSpecificTitle,
  isUsefulDeck,
  acceptsStoryForDisplay,
  pruneEmptySections,
};
