require('dotenv').config();

const cors = require('cors');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3001;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';

app.use(cors());
app.use(express.json({ limit: '15mb' }));

function logDebug(message, details) {
  if (details === undefined) {
    console.log(`[wellumi-debug] ${message}`);
    return;
  }

  console.log(`[wellumi-debug] ${message}`, details);
}

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

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'wellumi-label-analysis' });
});

app.post('/analyze-label', async (req, res) => {
  try {
    const { imageBase64, mimeType = 'image/jpeg' } = req.body || {};

    logDebug('POST /analyze-label hit');
    logDebug('Request body imageBase64 exists', Boolean(imageBase64));
    logDebug('Request body imageBase64 length', typeof imageBase64 === 'string' ? imageBase64.length : 0);
    logDebug('Request body mimeType', mimeType);

    if (!process.env.OPENAI_API_KEY) {
      logDebug('OPENAI_API_KEY missing; returning setup error');
      return res.status(500).json({
        error: 'OPENAI_API_KEY is missing. Copy server/.env.example to server/.env and add your key.',
      });
    }

    if (!imageBase64 || typeof imageBase64 !== 'string') {
      logDebug('Invalid request: imageBase64 missing or not a string');
      return res.status(400).json({
        error: 'imageBase64 is required.',
      });
    }

    const imageUrl = `data:${mimeType};base64,${imageBase64}`;

    logDebug('OpenAI request starting', { model: OPENAI_MODEL });
    const openaiResponse = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
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
          '- what_people_commonly_use_it_for: Describe consumer interest areas only, not benefits. Example: "People often look up zinc in connection with immune wellness, general nutrition, and supplement routines."',
          '- what_sources_say: Keep it cautious and source-literacy focused. Example: "Sources commonly describe zinc as an essential mineral. Product claims and supplement formulations vary, so it is useful to review the label and discuss personal questions with a qualified professional."',
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
    logDebug('OpenAI response received', {
      status: openaiResponse.status,
      ok: openaiResponse.ok,
      hasOutputText: typeof responseJson.output_text === 'string',
      outputType: Array.isArray(responseJson.output) ? 'array' : typeof responseJson.output,
      outputLength: Array.isArray(responseJson.output) ? responseJson.output.length : 0,
      hasError: Boolean(responseJson.error),
      errorMessage: responseJson.error?.message,
    });

    if (!openaiResponse.ok) {
      logDebug('OpenAI returned non-OK response', {
        status: openaiResponse.status,
        errorMessage: responseJson.error?.message,
      });
      return res.status(openaiResponse.status).json({
        error:
          responseJson.error?.message ||
          'OpenAI could not analyze the label right now.',
      });
    }

    const outputText = getOutputText(responseJson);
    logDebug('Parsed OpenAI output text shape', {
      exists: Boolean(outputText),
      length: outputText.length,
    });

    if (!outputText) {
      logDebug('OpenAI output text was empty');
      return res.status(502).json({
        error: 'OpenAI returned an empty label analysis.',
      });
    }

    const parsed = JSON.parse(outputText);
    logDebug('Returning parsed analysis', {
      productName: parsed.product_name,
      detectedLabelTextLength: parsed.detected_label_text?.length || 0,
      questionCount: Array.isArray(parsed.questions_to_ask_a_professional)
        ? parsed.questions_to_ask_a_professional.length
        : 0,
    });
    return res.json(parsed);
  } catch (error) {
    console.error('[wellumi-debug] Backend error in /analyze-label', {
      name: error.name,
      message: error.message,
      stack: error.stack,
    });
    return res.status(500).json({
      error: error.message || 'Unexpected label analysis error.',
    });
  }
});

app.listen(PORT, () => {
  console.log(`Wellumi label analysis server running on http://localhost:${PORT}`);
});
