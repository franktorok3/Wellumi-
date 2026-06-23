const { config, hasOpenAIConfig } = require('../config');

const STORY_PROMPT_VERSION = 'wellumi_story_v1';

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

function getOutputText(responseJson) {
  if (typeof responseJson.output_text === 'string') return responseJson.output_text;
  for (const item of responseJson.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === 'string') return content.text;
    }
  }
  return '';
}

function buildTemplateStory({ sourceRecords, storyCategory, topic, profile, personalizationReason }) {
  const primary = sourceRecords[0];
  const isSafety = storyCategory === 'safety_and_recalls' || sourceRecords.some((r) => r.safety_relevance >= 0.8);
  const title = isSafety
    ? `A safety update worth knowing about ${profile?.brand || 'this product category'}`
    : topic?.titleConcept
      ? `What ${topic.titleConcept} means in everyday wellness`
      : profile?.primaryIngredient
        ? `Why ${profile.primaryIngredient} keeps showing up in wellness routines`
        : profile?.productCategory === 'bottled_water'
          ? 'What bottled-water labels can—and cannot—tell you'
          : 'A grounded wellness story from your recent scans';

  const deck = personalizationReason || 'A source-backed Wellumi story in plain language.';
  const sourceSummary = sourceRecords
    .map((record, index) => `${index + 1}. ${record.title}`)
    .join('\n');

  return {
    title,
    deck,
    source_strength_label: sourceRecords.length >= 2 ? 'moderate' : 'light',
    editorial_confidence: 0.62,
    sections: {
      why_this_matters_now: deck,
      everyday_explanation:
        profile?.lifestyleTopics?.length
          ? `This story connects to everyday topics like ${profile.lifestyleTopics.slice(0, 2).join(' and ')}.`
          : 'Wellumi turns source updates into practical context for everyday product decisions.',
      what_people_commonly_use_it_for:
        profile?.commonClaims?.join(', ') ||
        profile?.labelTopics?.join(', ') ||
        'People often use products like this as part of routine wellness habits.',
      what_product_labels_commonly_say:
        profile?.labelClaims?.length
          ? `Labels may use terms such as ${profile.labelClaims.slice(0, 3).join(', ')}.`
          : 'Product labels often highlight ingredients, serving information, and marketing phrases that deserve careful reading.',
      what_reliable_sources_say:
        'The sources below discuss this topic without turning the item into medical advice. Wellumi summarizes what they describe and where uncertainty remains.',
      what_remains_uncertain:
        'Consumer products and labels can change, and individual needs vary. Sources may discuss general patterns rather than personal outcomes.',
      what_to_check_on_the_label:
        profile?.labelTopics?.slice(0, 3).join(', ') ||
        'Ingredients, serving details, warnings, and marketing claims',
      questions_worth_asking:
        'What does this label actually list? Does this product overlap with anything else I already use? Would a qualified professional consider this relevant for me?',
      sources: sourceSummary,
    },
  };
}

async function generateWellnessStory({
  sourceRecords,
  storyCategory,
  topic = null,
  profile = null,
  personalizationReason = null,
  isGeneral = true,
}) {
  if (!sourceRecords.length) {
    throw new Error('Cannot generate a Wellumi story without at least one source record.');
  }

  if (!hasOpenAIConfig()) {
    return {
      ...buildTemplateStory({ sourceRecords, storyCategory, topic, profile, personalizationReason }),
      model: 'template',
      prompt_version: STORY_PROMPT_VERSION,
    };
  }

  const sourceDigest = sourceRecords
    .map(
      (record, index) =>
        `Source ${index + 1} (${record.provider}): ${record.title}\nSummary: ${record.summary || record.abstract || 'No summary'}\nURL: ${record.source_url}`
    )
    .join('\n\n');

  const response = await fetch('https://api.openai.com/v1/responses', {
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
        'Distinguish marketing claims from evidence and acknowledge uncertainty.',
        'Use natural consumer language, not academic headlines.',
        'Titles must accurately reflect the cited sources without sensationalizing.',
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

  const responseJson = await response.json();
  if (!response.ok) {
    return {
      ...buildTemplateStory({ sourceRecords, storyCategory, topic, profile, personalizationReason }),
      model: config.openai.model,
      prompt_version: STORY_PROMPT_VERSION,
    };
  }

  const outputText = getOutputText(responseJson);
  const parsed = JSON.parse(outputText);
  parsed.sections = {
    ...parsed.sections,
    sources: sourceRecords.map((record) => record.title).join('\n'),
  };

  return {
    ...parsed,
    model: config.openai.model,
    prompt_version: STORY_PROMPT_VERSION,
  };
}

module.exports = {
  STORY_PROMPT_VERSION,
  generateWellnessStory,
  buildTemplateStory,
};
