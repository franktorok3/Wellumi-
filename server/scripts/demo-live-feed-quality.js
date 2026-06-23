#!/usr/bin/env node
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { hasOpenAIConfig, hasSupabaseConfig } = require('../src/config');
const { generateWellnessStory } = require('../src/services/storyGenerator');
const { getEvergreenForTopic, getRequiredBaseEvergreen } = require('../src/content/evergreenGuidance');
const { REQUIRED_BASE_TOPIC_IDS } = require('../src/content/baseFeedTopics');
const { classifyProduct } = require('../src/content/productInterestClassifier');
const { formatNutritionEntries } = require('../src/utils/formatNutrition');
const { evaluateSafetyEligibility } = require('../src/content/safetyRecall');
const { applyFeedMix } = require('../src/content/storyRanking');
const { buildFactualFallbackStory } = require('../src/services/storyGenerator');

const deerPark = {
  name: 'Deer Park Bottled Water',
  brand: 'Deer Park',
  ingredients_text: 'Spring water',
  nutrition_data: {
    per_100g: { energy_kcal_100g: 0, 'nova-group': 1, fat_100g: 0, sodium_100g: 0.001 },
  },
};

const sabra = {
  name: 'Sabra Classic Hummus',
  brand: 'Sabra',
  ingredients_text: 'Cooked chickpeas, tahini, soybean oil, garlic, salt, citric acid',
  nutrition_data: {
    per_100g: {
      energy_kcal_100g: 255.555555,
      fat_100g: 16.6666666666667,
      'saturated-fat_100g': 2.38,
      carbohydrates_100g: 20,
      sugars_100g: 0.5,
      fiber_100g: 6.67,
      proteins_100g: 6.67,
      salt_100g: 1.08,
      'nova-group_100g': 3,
    },
  },
};

const staleSabraRecall = {
  provider: 'openfda_food',
  source_type: 'food_recall',
  external_id: 'F-stale-sabra',
  title: 'Undeclared allergen',
  summary: 'Product: Sabra Classic Hummus',
  published_at: '2024-12-01',
  source_url: 'https://api.fda.gov/food/enforcement.json',
  raw_payload: {
    status: 'Terminated',
    product_description: 'Sabra Classic Hummus',
    reason_for_recall: 'Undeclared sesame',
    recalling_firm: 'Sabra',
    recall_initiation_date: '20241201',
  },
};

async function main() {
  console.log('=== Live feed quality demo ===');
  console.log('OpenAI configured:', hasOpenAIConfig());
  console.log('Supabase configured:', hasSupabaseConfig());

  const deerProfile = classifyProduct(deerPark, { scanCount: 1 });
  const sabraProfile = classifyProduct(sabra, { scanCount: 1, isSaved: true });

  console.log('\n--- Deer Park nutrition (formatted) ---');
  console.log(JSON.stringify(formatNutritionEntries(deerPark.nutrition_data), null, 2));

  console.log('\n--- Sabra nutrition (formatted) ---');
  console.log(JSON.stringify(formatNutritionEntries(sabra.nutrition_data), null, 2));

  console.log('\n--- Stale Sabra recall eligibility ---');
  console.log(JSON.stringify(evaluateSafetyEligibility(staleSabraRecall, sabraProfile), null, 2));

  const hydrationSources = getEvergreenForTopic('hydration-habits');
  const generated = await generateWellnessStory({
    sourceRecords: hydrationSources,
    storyCategory: 'everyday_wellness',
    topic: { id: 'hydration-habits', titleConcept: 'hydration and bottled-water labels' },
    profile: deerProfile,
    personalizationReason: 'Practical context on hydration and bottled-water labels.',
    isGeneral: true,
  });

  console.log('\n--- Deer Park general hydration story generation ---');
  console.log(
    JSON.stringify(
      {
        generation_mode: generated.generation_mode,
        fallback_reason: generated.fallback_reason,
        model: generated.model,
        title: generated.title,
        deck: generated.deck,
        sectionKeys: Object.keys(generated.sections || {}),
      },
      null,
      2
    )
  );

  const sabraLabelStory = buildFactualFallbackStory({
    sourceRecords: getEvergreenForTopic('claims-decoded-natural'),
    storyCategory: 'everyday_wellness',
    topic: { id: 'claims-decoded-natural' },
    profile: sabraProfile,
    personalizationReason: 'Related to your Sabra food scans',
    fallbackReason: 'verify_demo',
  });

  console.log('\n--- Sabra label/allergen context story (fallback) ---');
  console.log(
    JSON.stringify(
      {
        generation_mode: sabraLabelStory.generation_mode,
        title: sabraLabelStory.title,
        deck: sabraLabelStory.deck,
        sections: sabraLabelStory.sections,
      },
      null,
      2
    )
  );

  const baseFeed = REQUIRED_BASE_TOPIC_IDS.map((topicId) => {
    const story = buildFactualFallbackStory({
      sourceRecords: getEvergreenForTopic(topicId),
      storyCategory: 'everyday_wellness',
      topic: { id: topicId },
      fallbackReason: 'base_feed_seed',
    });
    return {
      topicId,
      generation_mode: story.generation_mode,
      title: story.title,
      deck: story.deck,
    };
  });

  console.log('\n--- Base feed mix (evergreen official guidance) ---');
  console.log(JSON.stringify(baseFeed, null, 2));
  console.log(`Base story count: ${baseFeed.length} (evergreen records available: ${getRequiredBaseEvergreen().length})`);

  const personalized = [
    {
      is_personalized: true,
      rank_score: 95,
      story: {
        story_category: 'everyday_wellness',
        is_general: false,
        display_eligible: true,
        generation_mode: 'fallback',
        title: sabraLabelStory.title,
        deck: sabraLabelStory.deck,
      },
    },
    ...baseFeed.slice(0, 4).map((item, index) => ({
      is_personalized: false,
      rank_score: 80 - index,
      matched_interests: [item.topicId],
      story: {
        story_category:
          item.topicId === 'otc-label-literacy'
            ? 'medicine_cabinet'
            : item.topicId === 'supplement-literacy'
              ? 'ingredient_spotlight'
              : item.topicId === 'claims-decoded-natural'
                ? 'claims_decoded'
                : item.topicId === 'functional-drinks-trend'
                  ? 'product_trends'
                  : 'everyday_wellness',
        is_general: true,
        display_eligible: true,
        generation_mode: 'fallback',
        title: item.title,
        deck: item.deck,
        topics: [item.topicId],
      },
    })),
  ];

  const mixed = applyFeedMix(personalized, { hasPersonalization: true });
  console.log('\n--- Personalized feed mix after ranking ---');
  console.log(
    JSON.stringify(
      mixed.map((item) => ({
        is_personalized: item.is_personalized,
        rank_score: item.rank_score,
        title: item.story?.title,
        generation_mode: item.story?.generation_mode,
      })),
      null,
      2
    )
  );
  console.log(
    `General stories retained: ${mixed.filter((item) => !item.is_personalized).length} / ${mixed.length}`
  );

  if (hasSupabaseConfig()) {
    try {
      const { getSupabaseAdmin } = require('../src/services/supabase');
      const supabase = getSupabaseAdmin();
      const { data: products } = await supabase
        .from('products')
        .select('id,name,brand,nutrition_data,ingredients_text')
        .or('name.ilike.%Deer Park%,name.ilike.%Sabra%')
        .limit(5);
      console.log('\n--- Saved products in database ---');
      console.log(JSON.stringify(products, null, 2));

      const { data: stories } = await supabase
        .from('wellness_stories')
        .select('id,title,deck,generation_mode,fallback_reason,is_general,safety_flag,created_at')
        .order('created_at', { ascending: false })
        .limit(8);
      console.log('\n--- Recent wellness stories ---');
      console.log(JSON.stringify(stories, null, 2));
    } catch (error) {
      console.log('\nDatabase query skipped:', error.message);
    }
  } else {
    console.log('\nSupabase not configured; skipping live database feed query.');
    console.log('Fallback reason when OpenAI is absent: openai_not_configured');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
