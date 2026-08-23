# PathRak

PathRak is a React/FastAPI personal-safety demonstration. It combines live browser GPS, OpenStreetMap-based maps, real provider route geometry, Clerk authentication, journey timers, and an honest SOS recording pipeline. Synthetic incident data and unverified station references are always disclosed as demo data.

## Quick Start

```powershell
cd backend
python -m pip install -r requirements.txt
Copy-Item .env.example .env
python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

```powershell
cd frontend
npm install
Copy-Item .env.example .env.local
npm run dev
```

Set the real Clerk values before starting. The API validates Clerk session JWTs for user registration, SOS, SOS history, danger reports, and SafeWalk mutations.

## Configuration

Frontend:

- `VITE_CLERK_PUBLISHABLE_KEY`: Clerk publishable key.
- `VITE_API_URL`: FastAPI origin, normally `http://127.0.0.1:8000`.

Backend:

- `CLERK_ISSUER_URL`: Clerk instance URL. This is required for protected APIs.
- `ALLOWED_ORIGINS`: comma-separated frontend origins.
- `PATHRAK_DEMO_MODE`: enables the visible, controlled Bengaluru demo environment.
- `ROUTING_PROVIDER`: `ors` for OpenRouteService or `osrm_demo` only while demo mode is enabled.
- `ORS_API_KEY`: required when `ROUTING_PROVIDER=ors`.
- `OSRM_BASE_URL`: public/self-hosted OSRM endpoint used by explicit demo routing. The public server has no production SLA.
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`: required together for real SMS requests.
- `PATHRAK_DATA_MODE`: `demo` or `real`.
- `PATHRAK_REAL_DATA_DIR`: verified `incidents.csv` and `police_stations.csv` directory for real mode.

No map token is required. Leaflet renders CARTO tiles attributed to CARTO and OpenStreetMap. Safe spots and lighting street geometry use OpenStreetMap Overpass and can be unavailable when that external service is slow.

## Controlled Demo

The selected geography is Bengaluru because the repository contains 5,000 synthetic incident rows and 25 station-reference rows there, more coverage than the included Delhi and Mysore subsets.

- Start: Mahatma Gandhi Road, Bengaluru (`12.9755, 77.6069`)
- Destination: Cubbon Park, Bengaluru (`12.9763, 77.5929`)
- Map: Leaflet with CARTO/OpenStreetMap tiles
- Demo routing: real OSRM road geometry, driving profile, public demo service
- Safety score: synthetic incident dataset
- Police stations: unverified references only, never dispatch

Demo mode never replaces GPS silently. Use the visible **Use Bengaluru demo location** control. The SafeWalk 15-second expiry option is also explicitly labeled and records exactly one SOS event.

## Truthful Service States

- SOS records an in-memory PathRak event. It does not contact police.
- Twilio status means the provider accepted the message request, not handset delivery.
- `tel:` and `sms:` actions open supported device handlers; PathRak does not claim completion.
- OSRM alternatives are requested but the provider may return only one route.
- Lighting street geometry is live OSM data; light condition, traffic, and savings values are deterministic simulations.
- Browser notifications, vibration, battery information, motion events, calling, and SMS drafts depend on device/browser support.
- In-memory users, SafeWalks, and SOS events are lost when the API restarts. Use a database before production.

## Verification

```powershell
cd backend
python -m unittest test_repair_flows.py -v
python -m unittest test_api_readiness.py -v
```

```powershell
cd frontend
npm run build
```

FastAPI documentation is available at `http://127.0.0.1:8000/docs` while the backend is running.
