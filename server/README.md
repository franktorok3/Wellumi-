# Wellumi Local Label Analysis Server

This server keeps the OpenAI API key out of the Expo app. The mobile app sends a captured label image to this local backend, and the backend calls OpenAI.

## Run Locally

```bash
npm install
copy .env.example .env
npm start
```

Add your key to `server/.env`:

```bash
OPENAI_API_KEY=your_openai_api_key_here
```

The server runs on `http://localhost:3001` by default.

## Expo App URL

In `App.js`, update `API_BASE_URL` to your computer's local network IP address when testing on a physical phone, for example:

```js
const API_BASE_URL = 'http://192.168.1.25:3001';
```

Do not use `localhost` from a phone. On a phone, `localhost` points to the phone itself, not your computer.

## Endpoint

`POST /analyze-label`

```json
{
  "imageBase64": "",
  "mimeType": "image/jpeg"
}
```

If `OPENAI_API_KEY` is missing, the server returns a clear setup error instead of calling OpenAI.
