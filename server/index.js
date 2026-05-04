require('dotenv').config();

const cors = require('cors');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3001;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';

app.use(cors());
app.use(express.json({ limit: '15mb' }));

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
  res.json({ ok: true });
});

app.post('/analyze-label', async (req, res) => {
  try {
    const { imageBase64, mimeType = 'image/jpeg' } = req.body || {};

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        error: 'OPENAI_API_KEY is missing. Copy server/.env.example to server/.env and add your key.',
      });
    }

    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return res.status(400).json({
        error: 'imageBase64 is required.',
      });
    }

    const imageUrl = `data:${mimeType};base64,${imageBase64}`;

    const openaiResponse = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        instructions:
          'You are Wellumi, an informational label-reading assistant. Return strict JSON only. Do not diagnose, do not recommend taking or avoiding any product, do not label anything safe or unsafe, do not score risk, do not make treatment claims, and do not suggest dosage. Keep output general and informational. Always remind the user to ask a qualified professional for personal guidance.',
        input: [
          {
            role: 'user',
            content: [
              {
                type: 'input_text',
                text:
                  'Read this supplement or OTC label image. Extract visible label text when possible and produce a conservative, informational summary using only the requested JSON shape.',
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
      return res.status(openaiResponse.status).json({
        error:
          responseJson.error?.message ||
          'OpenAI could not analyze the label right now.',
      });
    }

    const outputText = getOutputText(responseJson);

    if (!outputText) {
      return res.status(502).json({
        error: 'OpenAI returned an empty label analysis.',
      });
    }

    const parsed = JSON.parse(outputText);
    return res.json(parsed);
  } catch (error) {
    return res.status(500).json({
      error: error.message || 'Unexpected label analysis error.',
    });
  }
});

app.listen(PORT, () => {
  console.log(`Wellumi label analysis server running on http://localhost:${PORT}`);
});
