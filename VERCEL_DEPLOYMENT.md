# PathRak Single-Project Vercel Deployment

PathRak deploys as one Vercel project and one origin. Vercel builds the React/Vite frontend into `frontend/dist` and exposes the existing FastAPI application through `api/index.py` for all `/api/*` requests.

## Vercel Project Settings

- Root Directory: repository root (`.`)
- Framework Preset: Vite (also pinned by `vercel.json`)
- Install Command: `npm --prefix frontend ci`
- Build Command: `npm run build`
- Output Directory: `frontend/dist`
- Production Branch: `main`
- Python version: `3.12` from `.python-version`
- Fluid Compute: enabled (Vercel default; its default function duration covers the existing provider timeouts)

## Local Development

Use the repository root so local development mirrors the deployed Vercel shape:

```powershell
Copy-Item frontend/.env.local.example frontend/.env.local
Copy-Item backend/.env.example backend/.env
npm run dev
```

`npm run dev` starts `vercel dev`, which serves the Vite frontend and the FastAPI function on one origin at `http://localhost:3000`.

If you specifically need the old split frontend workflow, use `npm run dev:frontend` from the repository root and point `VITE_API_URL` at a separately running backend.

Do not set `VITE_API_URL` in Vercel. The frontend uses relative `/api/...` URLs on the same deployment origin.

## Environment Variables

Required in Vercel for Production, Preview, and Development as appropriate:

- `VITE_CLERK_PUBLISHABLE_KEY`: Clerk publishable key. This value is intentionally public and is embedded in the frontend bundle.
- `CLERK_ISSUER_URL`: exact Clerk instance issuer URL used to validate backend session JWTs.

Recommended explicit demo values:

- `PATHRAK_DEMO_MODE=true`
- `PATHRAK_DATA_MODE=demo`
- `ROUTING_PROVIDER=osrm_demo`
- `OSRM_BASE_URL=https://router.project-osrm.org`

Optional integrations and alternate modes:

- `ORS_API_KEY`: required only with `ROUTING_PROVIDER=ors`.
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`: set all three to enable Twilio SMS requests.
- `PATHRAK_REAL_DATA_DIR`: required only with `PATHRAK_DATA_MODE=real`; it must point to data bundled with the function, not a local machine path.
- `ALLOWED_ORIGINS`: not needed for the same Vercel origin. Set comma-separated origins only for a separate local frontend or another trusted client origin.
- `VITE_API_URL`: not needed in Vercel. It is only an optional frontend override for split local development.

Never add secret values to either example environment file or to Git.

## Clerk Configuration

1. Create or select the Clerk production instance.
2. Add the final `https://<project>.vercel.app` domain and any custom domain in Clerk's allowed origins/URLs where the selected Clerk configuration requires them.
3. Add the production publishable key as `VITE_CLERK_PUBLISHABLE_KEY` in Vercel.
4. Add that same instance's issuer URL as `CLERK_ISSUER_URL` in Vercel.
5. Redeploy after changing any `VITE_*` value because Vite embeds it at build time.

The backend continues to validate Clerk JWT signatures and issuer claims. No Clerk secret key is used or exposed by this repository.

## Routing

- `/` and frontend routes are served from the Vite output. The final rewrite is the SPA fallback.
- `/api/*` is matched by Vercel's filesystem function routing before the SPA rewrite and reaches the FastAPI `app` exported by `api/index.py`.
- `/api/health` is the public deployment health endpoint.
- `/api/docs` and `/api/openapi.json` expose the API documentation through the function path.

## Serverless Limitations

Vercel Functions do not provide a durable application filesystem or a continuously running process.

- The ML model and caches initialize lazily per function instance. Cold instances retrain the model from the bundled demo CSV.
- Demo CSV and police-station files are bundled read-only and remain available after deployment.
- Users, nearby-helper presence, SOS history, and SafeWalk records are in memory and can disappear or differ across instances.
- The continuous SafeWalk expiry monitor is disabled on Vercel. The existing client-triggered expiry endpoint remains available, but reliable unattended expiry requires a durable datastore and scheduled job.
- Danger-pin writes use `/tmp` on Vercel. They are temporary, instance-local, and may disappear at any time.
- Twilio, OSRM/OpenRouteService, Nominatim, Overpass, CARTO, and OpenStreetMap remain external network dependencies. Their availability and rate limits are outside PathRak's control.
- No police-dispatch integration exists. Twilio provider acceptance is not proof of handset delivery.

## Dashboard Deployment

1. Push the deployment-ready changes to the GitHub `main` branch.
2. In Vercel, choose **Add New > Project** and import the PathRak GitHub repository.
3. Keep **Root Directory** at the repository root. Do not select `frontend`.
4. Confirm the build settings above; `vercel.json` should populate them automatically.
5. Add the required environment variables and the recommended demo values.
6. Select **Deploy**.
7. Verify `https://<project>.vercel.app/`, `/api/health`, `/api/config`, and an authenticated protected flow.
8. If adding a custom domain, add it in Vercel and Clerk, then redeploy if the Clerk setup requires changed frontend configuration.
