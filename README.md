# PathRak

PathRak is a React/FastAPI personal-safety and intelligent route/network optimization demonstration. It combines live browser GPS, OpenStreetMap-based maps, real provider route geometry, Clerk authentication, journey timers, and an honest SOS recording pipeline. Synthetic incident data and unverified station references are always disclosed as demo data.

## Map integration and local-development fix

The map stack is Leaflet + OpenStreetMap Standard tiles, Nominatim place search, and either OpenRouteService or OSRM routing. CARTO's raster endpoint now requires a key and was removed because it rendered an `API KEY REQUIRED` watermark. The OSM Standard endpoint requires no key for low-volume development. The original split-development failure was that Vite had no `/api` proxy: a browser request such as `/api/geocode` could be answered by the frontend SPA fallback rather than FastAPI, causing map search/route fetches to fail while parsing HTML as JSON.

`frontend/vite.config.js` now proxies `/api` to the FastAPI origin during local Vite development. The Vercel deployment remains same-origin and uses its FastAPI function rewrite. Routing and geocoding are server-side, so provider credentials never enter the frontend bundle.

The route screen supports provider-returned road geometry, map markers, alternative selection when the provider supplies alternatives, retryable errors, location-denial messaging, and PathRak Merge Sort ranking by distance, ETA, planning cost, or safety risk. Planning cost is deliberately labelled as a ₹20/km rule-based estimate, not a fare. In demo mode, risk data is synthetic.

## Algorithm engine

`backend/algorithm_engine.py` contains PathRak's own independent implementations:

- BFS, DFS, and priority-queue Dijkstra on validated explicit graphs.
- Prim and Kruskal (with Disjoint Set Union) returning a minimum spanning forest for disconnected input.
- Stable Merge Sort, Quick Sort, Heap Sort, and Binary Search.
- Greedy benefit-to-cost selection, exact 0/1 Knapsack dynamic programming, and Branch & Bound.
- Deterministic synthetic graph generation and repeatable median benchmark measurement.

The new Network Design, Budget Optimizer, and Algorithm Analyzer screens call these backend APIs. Real map routes include a bounded graph constructed from the provider-returned candidate geometry; it is useful for inspecting or running PathRak algorithms, but is not a complete road network and cannot establish global city-wide optimality.

### Algorithm API

- `POST /api/algorithms/bfs`, `/dfs`, `/dijkstra`
- `POST /api/network/prim`, `/kruskal`
- `POST /api/algorithms/synthetic-graph`, `/benchmark`, `/sort-routes`, `/binary-search`
- `POST /api/resources/optimize`

Graph requests use `nodes`, `edges`, and optional `directed`; every edge has `source`, `target`, and optional non-negative `distance`, `time`, `cost`, and `risk` weights. See interactive FastAPI documentation at `/api/docs` while the backend is running.

## Quick Start

For the production-style single-origin local setup, configure the environment values and run Vercel from the repository root:

```powershell
Copy-Item frontend/.env.local.example frontend/.env.local
Copy-Item backend/.env.example backend/.env
npm run dev
```

Open `http://localhost:3000`; the frontend and FastAPI `/api/*` routes share that origin. See [VERCEL_DEPLOYMENT.md](VERCEL_DEPLOYMENT.md) for deployment settings and serverless limitations.

`npm run dev` now maps to `vercel dev` so the default local workflow matches the deployed Vercel routing model.

The split development setup remains available when needed:

```powershell
cd backend
python -m pip install -r requirements.txt
Copy-Item .env.example .env
python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

```powershell
cd frontend
npm install
Copy-Item .env.local.example .env.local
npm run dev:frontend
```

In a second terminal for split development:

```powershell
cd backend
python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

`VITE_BACKEND_URL=http://127.0.0.1:8000` is the default target for the local proxy. Set `VITE_API_URL` only when the API intentionally lives at another public origin.

Set the real Clerk values before starting. The API validates Clerk session JWTs for user registration, SOS, SOS history, danger reports, and SafeWalk mutations.

## Configuration

Frontend:

- `VITE_CLERK_PUBLISHABLE_KEY`: Clerk publishable key.
- `VITE_API_URL`: optional split-development FastAPI origin override. Leave unset for Vercel.

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

No map token is required for low-volume development. Leaflet renders OpenStreetMap Standard tiles with visible OSM attribution. Follow the OpenStreetMap Tile Usage Policy or select a hosted/self-hosted provider before production traffic. Safe spots and lighting street geometry use OpenStreetMap Overpass and can be unavailable when that external service is slow.

## Controlled Demo

The selected geography is Bengaluru because the repository contains 5,000 synthetic incident rows and 25 station-reference rows there, more coverage than the included Delhi and Mysore subsets.

- Start: Mahatma Gandhi Road, Bengaluru (`12.9755, 77.6069`)
- Destination: Cubbon Park, Bengaluru (`12.9763, 77.5929`)
- Map: Leaflet with OpenStreetMap Standard tiles
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
- On Vercel, danger pins are temporary `/tmp` data and continuous SafeWalk expiry monitoring is disabled because functions are ephemeral.

## Verification

```powershell
cd backend
python -m unittest test_repair_flows.py -v
python -m unittest test_api_readiness.py -v
python -m unittest test_algorithm_engine.py -v
```

```powershell
cd frontend
npm run build
```

FastAPI documentation is available at `http://127.0.0.1:8000/docs` while the backend is running.
