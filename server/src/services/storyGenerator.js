const { config, hasOpenAIConfig } = require('../config');
const { pruneEmptySections, containsFiller } = require('../content/feedQuality');
const {
  buildSafetyStoryTitle,
  buildSafetyDeck,
  evaluateSafetyEligibility,
} = require('../content/safetyRecall');
const { getEvergreenStorySeed } = require('../content/evergreenGuidance');

const STORY_PROMPT_VERSION = 'wellumi_story_v2';
const IS_DEV = process.env.NODE_ENV !== 'production';

const storySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'deck', 'sections', 'source_strength_label', 'editorial_confidence'],
  properties: {
    title: { type: 'string' },
    deck: { type: 'string' },
    source_strength_label: { type: 'string', enum: ['light', 'moderate', 'strong'] },
    editorial_confidence: { type: 'number' },
    sections: {
      type: 'object',
      additionalProperties: false,
      properties: {
        why_this_matters_now: { type: 'string' },
        everyday_explanation: { type: 'string' },
        what_people_commonly_use_it_for: { type: 'string' },
        what_product_labels_commonly_say: { type: 'string' },
        what_reliable_sources_say: { type: 'string' },
        what_remains_uncertain: { type: 'string' },
        what_to_check_on_the_label: { type: 'string' },
        questions_worth_asking: { type: 'string' },
      },
    },
  },
};

function logStoryGeneration(event, details = {}) {
  if (!IS_DEV) return;
  console.log('[wellumi-story-gen]', event, details);
}

function getOutputText(responseJson) {
  if (typeof responseJson.output_text === 'string') return responseJson.output_text;
  for (const item of responseJson.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === 'string') return content.text;
    }
  }
  return '';
}

function buildSourceCitation(sourceRecords) {
  return sourceRecords
    .map((record, index) => {
      const date = record.published_at ? ` · ${String(record.published_at).slice(0, 10)}` : '';
      return `${index + 1}. ${record.title} (${record.provider}${date})`;
    })
    .join('\n');
}

function buildFactualFallbackStory({
  sourceRecords,
  storyCategory,
  topic = null,
  profile = null,
  personalizationReason = null,
  safetyContext = null,
  fallbackReason = 'openai_unavailable',
}) {
  const primary = sourceRecords[0];
  const evergreenSeed = topic?.id ? getEvergreenStorySeed(topic.id) : null;

  let title;
  let deck;
  if (safetyContext?.normalized) {
    title = buildSafetyStoryTitle({
      matchType: safetyContext.matchType,
      profile,
      record: safetyContext.normalized,
      historical: safetyContext.historical,
    });
    deck = buildSafetyDeck({
      matchType: safetyContext.matchType,
      profile,
      record: safetyContext.normalized,
      historical: safetyContext.historical,
    });
  } else if (evergreenSeed) {
    title = evergreenSeed.title;
    deck = evergreenSeed.deck;
  } else if (storyCategory === 'ingredient_spotlight' && profile?.primaryIngredient) {
    title = `What ${profile.primaryIngredient} labels usually list`;
    deck = `Official supplement guidance helps explain what ${profile.primaryIngredient} labels include and what they do not establish.`;
  } else if (profile?.productCategory === 'bottled_water') {
    title = 'What bottled-water labels list—and what they do not prove';
    deck = 'Official hydration guidance helps interpret bottled-water labels without treating marketing language as proof.';
  } else if (profile?.productCategory === 'packaged_food' && profile?.brand) {
    title = `Reading the ${profile.brand} label you scanned`;
    deck = `This summary is based on the FDA source below and the label context from your ${profile.brand} scan.`;
  } else {
    title = primary.title;
    deck = primary.summary?.split('·')[0]?.trim() || primary.summary || primary.title;
  }

  const whatSourceSays = sourceRecords
    .map((record) => record.summary || record.abstract)
    .filter(Boolean)
    .join('\n\n');

  const whatToCheck =
    profile?.labelTopics?.slice(0, 3).join(', ') ||
    (profile?.productCategory === 'bottled_water'
      ? 'Water source wording, electrolytes if listed, serving size'
      : profile?.productCategory === 'packaged_food'
        ? 'Allergens, serving size, sodium, ingredient order'
        : 'Ingredients, serving details, warnings, and marketing claims');

  const sections = pruneEmptySections({
    why_this_matters_now: personalizationReason || deck,
    what_reliable_sources_say: whatSourceSays,
    what_to_check_on_the_label: whatToCheck,
    sources: buildSourceCitation(sourceRecords),
  });

  return {
    title,
    deck,
    generation_mode: 'fallback',
    fallback_reason: fallbackReason,
    source_strength_label: sourceRecords.some((record) => record.is_evergreen) ? 'strong' : 'moderate',
    editorial_confidence: sourceRecords.some((record) => record.is_evergreen) ? 0.88 : 0.72,
    sections,
    model: 'factual_fallback',
    prompt_version: STORY_PROMPT_VERSION,
  };
}

function validateAiStory(parsed, sourceRecords) {
  if (!parsed?.title || !parsed?.deck || !parsed?.sections) {
    return { ok: false, reason: 'schema_missing_fields' };
  }
  if (containsFiller(parsed.title) || containsFiller(parsed.deck)) {
    return { ok: false, reason: 'ai_filler_copy' };
  }
  const grounded = Object.entries(parsed.sections).filter(
    ([key, value]) => key !== 'sources' && value && String(value).trim().length >= 24
  );
  if (grounded.length < 2) {
    return { ok: false, reason: 'ai_insufficient_sections' };
  }
  if (!sourceRecords.length) {
    return { ok: false, reason: 'no_sources' };
  }
  return { ok: true };
}

async function generateWellnessStory({
  sourceRecords,
  storyCategory,
  topic = null,
  profile = null,
  personalizationReason = null,
  isGeneral = true,
  safetyContext = null,
}) {
  if (!sourceRecords.length) {
    throw new Error('Cannot generate a Wellumi story without at least one source record.');
  }

  const openAiConfigured = hasOpenAIConfig();
  logStoryGeneration('start', {
    openAiConfigured,
    model: config.openai.model,
    storyCategory,
    sourceCount: sourceRecords.length,
    isGeneral,
  });

  if (!openAiConfigured) {
    logStoryGeneration('fallback', { reason: 'openai_not_configured' });
    return buildFactualFallbackStory({
      sourceRecords,
      storyCategory,
      topic,
      profile,
      personalizationReason,
      safetyContext,
      fallbackReason: 'openai_not_configured',
    });
  }

  const sourceDigest = sourceRecords
    .map(
      (record, index) =>
        `Source ${index + 1} (${record.provider}): ${record.title}\nSummary: ${record.summary || record.abstract || 'No summary'}\nURL: ${record.source_url}`
    )
    .join('\n\n');

  let response;
  let responseJson;
  try {
    response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.openai.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.openai.model,
        instructions: [
          'You are Wellumi, a lifestyle-oriented wellness companion editor.',
          'Write grounded, neutral, source-backed consumer stories.',
          'Return strict JSON only using the provided schema.',
          'Do not diagnose, prescribe, dose, or claim efficacy.',
          'Do not invent citations, dates, facts, or study conclusions.',
          'Do not use filler phrases such as "products like this", "routine wellness habits", or "this story connects to everyday topics".',
          'Every sentence must be traceable to the provided sources or the product facts provided.',
          'Use natural consumer language, not academic headlines.',
          'Titles must be specific and accurately reflect the cited sources.',
        ].join('\n'),
        input: [
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: [
                  `Story category: ${storyCategory}`,
                  `General feed: ${isGeneral ? 'yes' : 'no'}`,
                  profile ? `Product profile: ${JSON.stringify(profile)}` : '',
                  topic ? `Topic: ${JSON.stringify({ id: topic.id, titleConcept: topic.titleConcept })}` : '',
                  personalizationReason ? `Personalization reason: ${personalizationReason}` : '',
                  'Use only the sources below as evidence.',
                  sourceDigest,
                ]
                  .filter(Boolean)
                  .join('\n'),
              },
            ],
          },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'wellumi_story',
            strict: true,
            schema: storySchema,
          },
        },
      }),
    });
    responseJson = await response.json();
  } catch (error) {
    logStoryGeneration('fallback', { reason: 'network_error', message: error.message });
    return buildFactualFallbackStory({
      sourceRecords,
      storyCategory,
      topic,
      profile,
      personalizationReason,
      safetyContext,
      fallbackReason: `network_error:${error.message}`,
    });
  }

  const requestId = responseJson?.id || response.headers?.get?.('x-request-id') || null;
  logStoryGeneration('response', {
    status: response.status,
    requestId,
    openAiConfigured,
    model: config.openai.model,
  });

  if (!response.ok) {
    const apiMessage = responseJson?.error?.message || `status_${response.status}`;
    logStoryGeneration('fallback', {
      reason: 'openai_http_error',
      status: response.status,
      requestId,
      message: apiMessage,
    });
    return buildFactualFallbackStory({
      sourceRecords,
      storyCategory,
      topic,
      profile,
      personalizationReason,
      safetyContext,
      fallbackReason: `openai_http_error:${response.status}:${apiMessage}`,
    });
  }

  let parsed;
  try {
    const outputText = getOutputText(responseJson);
    if (!outputText) {
      logStoryGeneration('fallback', { reason: 'empty_output', requestId });
      return buildFactualFallbackStory({
        sourceRecords,
        storyCategory,
        topic,
        profile,
        personalizationReason,
        safetyContext,
        fallbackReason: 'empty_output',
      });
    }
    parsed = JSON.parse(outputText);
  } catch (error) {
    logStoryGeneration('fallback', { reason: 'parse_failure', requestId, message: error.message });
    return buildFactualFallbackStory({
      sourceRecords,
      storyCategory,
      topic,
      profile,
      personalizationReason,
      safetyContext,
      fallbackReason: `parse_failure:${error.message}`,
    });
  }

  const validation = validateAiStory(parsed, sourceRecords);
  if (!validation.ok) {
    logStoryGeneration('fallback', { reason: validation.reason, requestId });
    return buildFactualFallbackStory({
      sourceRecords,
      storyCategory,
      topic,
      profile,
      personalizationReason,
      safetyContext,
      fallbackReason: validation.reason,
    });
  }

  parsed.sections = pruneEmptySections({
    ...parsed.sections,
    sources: buildSourceCitation(sourceRecords),
  });

  logStoryGeneration('success', { requestId, generation_mode: 'ai' });

  return {
    ...parsed,
    generation_mode: 'ai',
    fallback_reason: null,
    model: config.openai.model,
    prompt_version: STORY_PROMPT_VERSION,
  };
}

module.exports = {
  STORY_PROMPT_VERSION,
  generateWellnessStory,
  buildFactualFallbackStory,
  logStoryGeneration,
};
