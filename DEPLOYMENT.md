# Medika AI Backend Deployment

This project can run as a single lightweight Python service that serves both:

- the static frontend pages
- the `/api/*` backend endpoints

## 1. Required environment variables

Minimum:

```bash
HOST=0.0.0.0
PORT=8000
APP_ENV=production
MEDIKA_APP_VERSION=2026.05.02
```

Optional:

```bash
AZURE_SPEECH_KEY=your_key
AZURE_SPEECH_REGION=your_region
AZURE_SPEECH_VOICE_AR=ar-LB-RamiNeural
AZURE_SPEECH_VOICE_EN=en-US-JennyNeural
MEDIKA_ALLOWED_ORIGINS=https://your-frontend.example.com,capacitor://localhost,http://localhost
```

## 2. Local production-style run

```bash
python app.py
```

Health check:

```bash
GET /api/health
```

Example response:

```json
{
  "status": "ok",
  "service": "Medika AI API",
  "version": "2026.05.02",
  "environment": "production",
  "azure_speech_configured": false,
  "rag_entries": 36
}
```

## 3. Docker build

```bash
docker build -t medika-ai .
docker run -p 8000:8000 --env HOST=0.0.0.0 --env PORT=8000 medika-ai
```

Then open:

```text
http://localhost:8000
```

## 4. Frontend-to-backend connection

If the frontend is deployed separately, set:

```js
window.MEDIKA_CONFIG = {
    apiBase: "https://your-medika-api.example.com"
};
```

inside `app-config.js`.

## 5. Recommended deployment sequence

1. Deploy the Python backend first.
2. Confirm `/api/health` returns `status: ok`.
3. Add the deployed backend URL to `app-config.js`.
4. Rebuild the mobile/web bundle if needed.
5. Test `chat.html`, `report.html`, `decision.html`, and `integrative.html`.

## 6. Notes

- The service already supports `HOST` and `PORT`, so it can run on most managed platforms.
- CORS is controlled through `MEDIKA_ALLOWED_ORIGINS`.
- Azure Speech is optional; browser audio fallback still works when Azure is not configured.
