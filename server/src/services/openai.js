const { config } = require('../config');
const { openAiLabelSummarySchema } = require('../schemas/validation');

const labelSummarySchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'product_name',
    'detected_label_text',
    'what_it_is',
    'what_people_commonly_use_it_for',
    'what_sources_say',
    'questions_to_ask_a_professional',
    'neutral_disclaimer',
  ],
  properties: {
    product_name: { type: 'string' },
    detected_label_text: { type: 'string' },
    what_it_is: { type: 'string' },
    what_people_commonly_use_it_for: { type: 'string' },
    what_sources_say: { type: 'string' },
    questions_to_ask_a_professional: {
      type: 'array',
      items: { type: 'string' },
    },
    neutral_disclaimer: { type: 'string' },
  },
};

function getOutputText(responseJson) {
  if (typeof responseJson.output_text === 'string') {
    return responseJson.output_text;
  }

  const output = responseJson.output || [];
  for (const item of output) {
    for (const content of item.content || []) {
      if (typeof content.text === 'string') {
        return content.text;
      }
    }
  }

  return '';
}

async function analyzeLabelImage({ imageBase64, mimeType = 'image/jpeg' }) {
  if (!config.openai.apiKey) {
    const error = new Error('OPENAI_API_KEY is missing. Copy server/.env.example to server/.env and add your key.');
    error.statusCode = 500;
    throw error;
  }

  const imageUrl = `data:${mimeType};base64,${imageBase64}`;
  const openaiResponse = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.openai.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.openai.model,
      instructions: [
        'You are Wellumi, a conservative, informational label-reading assistant.',
        'Return strict JSON only using the provided schema. Do not add markdown, citations, or extra keys.',
        'The goal is source-literacy and label context, not health guidance.',
        '',
        'Hard guardrails:',
        '- Do not diagnose.',
        '- Do not interpret dosage.',
        '- Do not suggest dosage.',
        '- Do not compare dosage to recommended daily values.',
        '- Do not give usage advice.',
        '- Do not suggest taking or avoiding the product.',
        '- Do not say safe or unsafe.',
        '- Do not score risk.',
        '- Do not make treatment claims.',
        '- Do not make efficacy claims.',
        '- Do not say the product supports, improves, treats, reduces, prevents, boosts, stabilizes, or helps any condition, symptom, outcome, body function, or body system.',
        '- Do not mention studies showing benefits unless phrased only as "some sources discuss..." without validating the claim.',
        '- Do not mention "individual health status" unless telling users to ask a qualified professional.',
        '',
        'Preferred language:',
        '- "This appears to be..."',
        '- "It is commonly marketed around..."',
        '- "People often look it up in connection with..."',
        '- "Sources commonly describe [ingredient] as..."',
        '- "Questions to ask a professional..."',
        '',
        'Field guidance:',
        '- product_name: Use the visible product or ingredient name. If uncertain, say "Unknown product" or "Unclear label".',
        '- detected_label_text: Extract concise visible label text. Do not infer hidden text.',
        '- what_it_is: Identify the product type and visible ingredient/category. Avoid dosage interpretation.',
        '- what_people_commonly_use_it_for: Describe consumer interest areas only, not benefits.',
        '- what_sources_say: Keep it cautious and source-literacy focused.',
        '- questions_to_ask_a_professional: Include questions about medication interactions, appropriate use, existing conditions, and whether the product is relevant for the person.',
        '- neutral_disclaimer: Keep short and plain-English. Always remind the user to ask a qualified professional for personal guidance.',
      ].join('\n'),
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: [
                'Read this supplement or OTC label image.',
                'Extract visible label text when possible.',
                'Produce a conservative, informational label summary only.',
                'Do not infer benefits, dosage meaning, efficacy, treatment use, or personal suitability.',
              ].join(' '),
            },
            {
              type: 'input_image',
              image_url: imageUrl,
              detail: 'high',
            },
          ],
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'wellumi_label_summary',
          strict: true,
          schema: labelSummarySchema,
        },
      },
    }),
  });

  const responseJson = await openaiResponse.json();

  if (!openaiResponse.ok) {
    const error = new Error(
      responseJson.error?.message || 'OpenAI could not analyze the label right now.'
    );
    error.statusCode = openaiResponse.status;
    throw error;
  }

  const outputText = getOutputText(responseJson);
  if (!outputText) {
    const error = new Error('OpenAI returned an empty label analysis.');
    error.statusCode = 502;
    throw error;
  }

  const parsedJson = JSON.parse(outputText);
  const validated = openAiLabelSummarySchema.safeParse(parsedJson);
  if (!validated.success) {
    const error = new Error('OpenAI returned an invalid label analysis shape.');
    error.statusCode = 502;
    throw error;
  }

  return validated.data;
}

module.exports = {
  analyzeLabelImage,
};
