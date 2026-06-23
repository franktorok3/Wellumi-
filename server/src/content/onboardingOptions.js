const ONBOARDING_INTERESTS = [
  { id: 'sleep', label: 'Better sleep' },
  { id: 'nutrition', label: 'Everyday nutrition' },
  { id: 'hydration', label: 'Hydration' },
  { id: 'stress', label: 'Stress and relaxation' },
  { id: 'movement', label: 'Movement and recovery' },
  { id: 'supplements', label: 'Supplements' },
  { id: 'medicine_cabinet', label: 'Medicine cabinet' },
  { id: 'healthy_aging', label: 'Healthy aging' },
  { id: 'food_literacy', label: 'Food and ingredient literacy' },
  { id: 'trends', label: 'Wellness trends' },
  { id: 'herbal', label: 'Herbal and alternative wellness' },
  { id: 'safety', label: 'Product safety and recalls' },
];

const ONBOARDING_USE_CASES = [
  { id: 'understand_labels', label: 'Understand product labels' },
  { id: 'compare_ingredients', label: 'Compare ingredients' },
  { id: 'follow_trends', label: 'Follow wellness trends' },
  { id: 'track_products', label: 'Track products I use' },
  { id: 'decode_claims', label: 'Learn what claims really mean' },
  { id: 'safety_updates', label: 'Hear about recalls and safety updates' },
  { id: 'daily_habits', label: 'Build healthier daily habits' },
];

const CONTENT_BALANCE_CATEGORIES = [
  { id: 'everyday_guidance', label: 'Practical everyday guidance' },
  { id: 'ingredient_explainers', label: 'Product and ingredient explainers' },
  { id: 'trends', label: 'New products and trends' },
  { id: 'safety', label: 'Safety and recalls' },
  { id: 'evidence', label: 'Deeper evidence summaries' },
];

const LIMITABLE_TOPICS = [
  { id: 'weight_loss', label: 'Weight-loss content' },
  { id: 'alternative_wellness', label: 'Alternative wellness' },
  { id: 'supplements', label: 'Supplements' },
  { id: 'otc_medication', label: 'OTC medication' },
  { id: 'product_trends', label: 'Product trends' },
  { id: 'technical_research', label: 'Technical research' },
];

const BALANCE_LEVELS = ['less', 'balanced', 'more'];

const DEFAULT_CONTENT_BALANCE = Object.fromEntries(
  CONTENT_BALANCE_CATEGORIES.map((item) => [item.id, 'balanced'])
);

const SIGNAL_WEIGHTS = {
  onboarding_interest: 8,
  manual_more: 10,
  manual_follow: 12,
  manual_limit: -20,
  not_relevant: -15,
  less_like_this: -8,
  more_like_this: 8,
  scan_once: 1,
  scan_repeat_category: 2,
  repeated_ingredient: 4,
  saved_category: 6,
  saved_ingredient: 7,
  saved_active_ingredient: 7,
  story_opened: 1,
  source_opened: 2,
  story_saved: 5,
  story_dismissed: -3,
};

const SIGNAL_CAPS = {
  scan_once: 3,
  story_opened: 12,
  source_opened: 16,
  scan_repeat_category: 8,
};

const SIGNAL_DECAY_DAYS = {
  scan_once: 21,
  story_opened: 14,
  scan_repeat_category: 60,
  not_relevant: 90,
};

module.exports = {
  ONBOARDING_INTERESTS,
  ONBOARDING_USE_CASES,
  CONTENT_BALANCE_CATEGORIES,
  LIMITABLE_TOPICS,
  BALANCE_LEVELS,
  DEFAULT_CONTENT_BALANCE,
  SIGNAL_WEIGHTS,
  SIGNAL_CAPS,
  SIGNAL_DECAY_DAYS,
};
