# PathRak

PathRak is a full-stack personal safety web app focused on situational awareness, safer route guidance, SOS dispatch helpers, and location-aware safety utilities. The current codebase is an MVP-style project with a React/Vite frontend and a FastAPI backend.

## What It Does

- Shows a safety heatmap based on local incident data and model-driven risk scoring.
- Scores routes and can request alternate routes through OpenRouteService when an API key is configured.
- Supports SOS dispatch flows, emergency-contact SMS hooks, Smart Check, SafeWalk, safe spots, and lighting status views.
- Stores user profile data locally in the browser for quick alerting flows.

## Current State

This repository is a working demo/MVP, not a production-hardened system. Several features are simulated or heuristic-driven, and some integrations are optional.

## Tech Stack

- Frontend: React 18, Vite, Tailwind CSS, React Leaflet
- Backend: FastAPI, Uvicorn, Pandas, NumPy, scikit-learn, Requests
- Data: Local CSV/JSON files under `backend/data`
- Optional integrations: OpenRouteService, Twilio

## Project Structure

```text
.
|-- backend/
|   |-- data/
|   |-- auth.py
|   |-- lighting.py
|   |-- main.py
|   |-- model.py
|   |-- requirements.txt
|   |-- safespots.py
|   |-- safewalk.py
|   |-- sos.py
|   `-- users.py
|-- frontend/
|   |-- public/
|   |-- src/
|   |-- index.html
|   |-- package.json
|   `-- vite.config.js
`-- .gitignore
```

## Setup

### Backend

```bash
cd backend
python -m pip install -r requirements.txt
copy .env.example .env
python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend build command is:

```bash
npm run build
```

## Environment Variables

Backend variables are documented in [backend/.env.example](/E:/safe-her-ai-main/backend/.env.example).

- `ALLOWED_ORIGINS`: comma-separated CORS origins
- `ORS_API_KEY`: optional OpenRouteService API key for alternate-route fetching
- `TWILIO_ACCOUNT_SID`: optional Twilio SID
- `TWILIO_AUTH_TOKEN`: optional Twilio auth token
- `TWILIO_PHONE_NUMBER`: optional Twilio sender number

## API Notes

- FastAPI docs are available at `/docs` when the backend is running.
- The frontend expects the backend on `http://127.0.0.1:8000` unless changed in frontend source/config.
- OTP authentication is currently mock/demo based.

## Current Limitations

- There is no persistent database; user/session-style data is mostly local or in-memory.
- SMS delivery requires valid Twilio credentials.
- `POST /api/route/find-safe` currently has a pre-existing fallback-path bug when `ORS_API_KEY` is missing.
- `POST /api/sos/trigger` currently has a pre-existing Windows console encoding issue in this environment because of Unicode logging in `backend/sos.py`.
- Heatmap, lighting, and some safety signals are simulated or derived from local datasets rather than live citywide telemetry.

## Validation

Validated on Saturday, August 22, 2026:

- Frontend install/build works with `npm install` and `npm run build`
- Backend starts with Uvicorn
- Overpass connectivity test returns HTTP 200

## Canonical Repository

PathRak is now intended to live at:

`https://github.com/NishchalKap/PathRak`

---
