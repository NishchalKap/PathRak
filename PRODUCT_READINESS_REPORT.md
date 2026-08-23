# PathRak Product Readiness Report

Audit date: 2026-08-23

## Executive Verdict

PathRak is an honest, coherent hackathon demo, not a production emergency platform. The controlled Bengaluru route, synthetic risk scoring, route-linked SafeWalk, one-shot expiry SOS, maps, heatmap, and simulated lighting scenario are demoable. Police dispatch is not implemented, Twilio is not configured, Overpass safe-spot lookup was unavailable during the final run, and a complete authenticated browser rehearsal is still required with a real Clerk test account.

## Demo Geography

| Item | Selection | Basis |
| --- | --- | --- |
| City | Bengaluru | 5,000 synthetic incident rows and 25 station-reference rows, the strongest included coverage |
| Start | Mahatma Gandhi Road, `12.9755, 77.6069` | Inside incident/station coverage and routable |
| Destination | Cubbon Park, `12.9763, 77.5929` | Nominatim-resolved and routable |
| Map | Leaflet + CARTO/OpenStreetMap tiles | Live tiles returned `200` |
| Demo routing | Public OSRM road routing | Live test returned 2.797 km and 90 geometry points |
| Production routing option | OpenRouteService | Requires `ORS_API_KEY`; not configured |
| Safety data | Synthetic PathRak incidents | Explicitly labeled demo data |
| Station data | Unverified demo references | Reference only; never dispatch |

Demo location is never selected silently. Real browser GPS remains the default; the user must click **Use Bengaluru demo location**.

## Final Feature Truth Table

| Feature | Status | Real/Simulated | Dependency | Demo Ready |
| --- | --- | --- | --- | --- |
| Clerk sign-up/sign-in/UserButton/logout | PARTIAL | Real | Clerk development instance | Yes, after user sign-in; authenticated rehearsal pending |
| Backend authentication | NOT VERIFIED | Real implementation | Clerk JWT/JWKS | Unit verified; real session token pending |
| GPS | PARTIAL | Real | Browser/device permission | Logic ready; physical GPS not tested here |
| Demo location | WORKING | Explicit simulation | `PATHRAK_DEMO_MODE` | Yes |
| Maps | WORKING | Real tiles | CARTO/OpenStreetMap | Yes |
| Safe Route | WORKING | Real road geometry + demo risk | OSRM demo or configured ORS | Yes |
| Route alternatives | PARTIAL | Real provider results | Provider must find distinct alternatives | Yes, but final route returned one candidate |
| Safety score | WORKING | Synthetic incident data | Local model/data | Yes, explicitly disclosed |
| SafeWalk | PARTIAL | Real timer/API; estimated walking ETA | GPS, route distance, signed-in API | Yes; authenticated browser rehearsal pending |
| Auto-SOS | WORKING | Real PathRak event | SafeWalk backend | Yes; exactly-once tests pass |
| Manual SOS | WORKING | Real in-memory event | GPS, signed-in API | Yes |
| Shake SOS | PARTIAL | Real logic | Motion-capable mobile browser | Logic verified; physical device not verified |
| Emergency contacts | PARTIAL | Real account-scoped local profile | Clerk identity, browser storage | Create/update/delete implemented; browser rehearsal pending |
| Emergency call | PARTIAL | Real `tel:` handoff | Supported mobile/device handler | Device required |
| Emergency SMS draft | PARTIAL | Real `sms:` handoff | Supported mobile/device handler | Device required |
| Twilio SMS | NOT VERIFIED | Real integration | Twilio credentials | No |
| Police dispatch | NOT IMPLEMENTED | None | Dispatch partnership/provider | No |
| Heatmap | WORKING | Synthetic incident data on real map | Local API/model + tiles | Yes |
| Lighting | SIMULATED | Location-centered demo grid/statuses | Demo mode | Yes, clearly labeled |
| Live OSM lighting geometry | BLOCKED | Real geometry, simulated status | Overpass | No; provider timed out |
| Safe spots | BLOCKED | Real OSM places | Overpass | No; returned honest `503` |
| Smart Check | PARTIAL | Real foreground timer/event | Open browser session, GPS | Yes for foreground demo; not durable |
| Safe Monitoring | PARTIAL | Real GPS polling; real-data-only warning | Real incident mode, browser/device APIs | Limited in demo mode |
| Danger reports | WORKING | Real local JSON persistence | Signed-in API | Yes; not production storage |
| Incident history | WORKING | Synthetic records | Local demo CSV | Yes |
| Station information | WORKING | Unverified references | Demo CSV | Yes, reference-only label |
| Profile/home location | PARTIAL | Clerk-keyed browser persistence | Browser storage | Yes; no durable database |
| Notifications/vibration/battery | PARTIAL | Real browser/device APIs | Permission and browser support | Device dependent |
| Exit Call | SIMULATED | Intentional browser-only simulation | Speech synthesis | Yes, explicitly labeled |

## Major Flow Traces

| Flow | Trace | Result |
| --- | --- | --- |
| Safe Route | UI -> geocode -> route API -> OSRM/ORS -> geometry -> model samples -> score -> Leaflet | WORKING in OSRM demo mode |
| Route to SafeWalk | selected route -> route distance -> estimated walking ETA -> protected start API -> timer | WORKING in code/API; authenticated browser rehearsal pending |
| Manual SOS | confirmation -> GPS/profile -> Clerk bearer token -> protected API -> user identity override -> event -> optional Twilio -> truthful result | WORKING for event recording |
| SafeWalk expiry | countdown -> protected expire API -> atomic claim -> common SOS pipeline -> response -> emergency state | WORKING and idempotent |
| Smart Check | user timer -> zero threshold -> common SOS API -> result state | PARTIAL; foreground-only state |
| Shake | motion permission -> three-shake window -> duplicate guard -> common SOS API | LOGIC VERIFIED; hardware pending |
| Lighting | selected location -> API -> deterministic demo grid -> simulated status/savings -> Leaflet | SIMULATED and disclosed |

## UI Action Audit

| UI Action | Expected | Actual | Status |
| --- | --- | --- | --- |
| Create account / Sign in | Open Clerk flow | Clerk modal opens responsively | WORKING |
| UserButton / Sign out | Manage/sign out account | Clerk-managed | NOT VERIFIED in signed-in browser |
| Theme toggle | Change and persist theme | DOM class + Clerk-user-independent local preference | WORKING |
| Demo location toggle | Explicitly switch live/demo location | Shared location source changes with banner | WORKING |
| Navigation rail/bottom bar | Open selected page | Shared page state changes | WORKING |
| Save profile | Validate and persist profile | E.164 validation, Clerk-keyed storage, protected helper registration | PARTIAL pending signed-in rehearsal |
| Delete profile | Remove/deactivate after confirmation | Local removal + protected backend deactivation | PARTIAL pending signed-in rehearsal |
| Find safer routes | Fetch and draw provider routes | Real provider geometry and demo score | WORKING |
| Load Bengaluru demo route | Populate controlled scenario | Explicit start/destination selection | WORKING |
| Use selected route in SafeWalk | Carry destination/distance | Route-linked ETA setup | WORKING |
| Start/extend/cancel SafeWalk | Mutate monitored journey | Protected backend mutation + UI state | WORKING in tests |
| 15-second expiry demo | Trigger one controlled expiry | Exactly one recorded SOS | WORKING |
| Prepare/confirm SOS | Record intentional emergency event | Confirmation modal + protected common pipeline | WORKING in tests |
| Call emergency contact | Open device dialer | `tel:` link; no success claim | DEVICE DEPENDENT |
| Open SMS draft | Open prefilled composer | `sms:` link; no delivery claim | DEVICE DEPENDENT |
| Smart Check controls | Start/reset/check in | Foreground timer and common SOS call | PARTIAL |
| Shake enable | Request/use motion events | Permission/threshold/guard logic | DEVICE NOT VERIFIED |
| Heatmap refresh/time controls | Reload modeled risk | API response rendered on Leaflet | WORKING |
| Report danger pin | Persist selected report | Protected API writes JSON | WORKING in code/API |
| Safe spots toggle | Load live OSM places | Honest error while Overpass unavailable | BLOCKED |
| Lighting refresh/hour | Recompute selected-location scenario | Deterministic explicit simulation | SIMULATED |
| Exit Call schedule/answer/end | Run discreet fake-call simulation | Browser-only speech/timer, disclosed | SIMULATED |

No visible route-guidance button now claims turn-by-turn navigation. The former coordinate-derived voice directions were removed; only a truthful spoken route summary remains.

## API Audit

| Endpoint group | Final test | Status |
| --- | --- | --- |
| `/health`, `/api/config` | Parsed live responses | WORKING |
| `/api/heatmap` | 169 points, `DEMO` disclosure | WORKING |
| `/api/hotspots` | 870 clusters | WORKING |
| `/api/zone/risk`, `/api/route/score` | Parsed model responses | WORKING |
| `/api/route/find-safe` | One OSRM route, 90 points, 2.797 km | WORKING |
| `/api/geocode` | Cubbon Park resolved by Nominatim | WORKING |
| `/api/lighting/zone`, `/map`, `/savings` | 544 explicit demo segments + simulated metadata | SIMULATED |
| `/api/sos/nearest-station` | Demo references returned | WORKING, reference only |
| `/api/safe-spots` | External providers failed | BLOCKED, honest `503` |
| `/api/incidents/history`, `/api/pins` | Parsed responses | WORKING |
| Protected user/SOS/SafeWalk endpoints | Missing token `401`; spoof/isolation tests pass with identity override | IMPLEMENTED, real Clerk token pending |
| Twilio paths | Credentials absent | NOT VERIFIED |

## Verification Evidence

- Frontend production build: PASS, 160 modules transformed.
- Backend tests: PASS, 9/9.
- Live API sweep: all local/model/provider endpoints passed except Overpass-dependent Safe Spots; Lighting uses explicit demo mode.
- Browser console: no errors; one expected Clerk development-key warning.
- Responsive sign-in page: 320x700, 390x844, 768x1024, and 1440x900 passed without horizontal overflow.
- Clerk create-account modal: 280 px dialog at 320 px viewport; no overflow.
- Map tiles: CARTO light/dark and OpenStreetMap tile requests returned image responses.
- Physical GPS, motion, calling, SMS draft, vibration, battery, and notifications: NOT VERIFIED on hardware.
- Twilio delivery: NOT VERIFIED; no credentials were available.
- Authenticated browser flow: NOT VERIFIED; no signed-in test account was available.

## Blockers

### P0

- Perform one authenticated browser rehearsal with a real Clerk test account: profile -> demo location -> route -> SafeWalk -> 15-second expiry -> SOS result -> reset. Code/API tests pass, but this complete browser flow has not been observed.

### P1

- Overpass was unavailable, so real Safe Spots are blocked and live OSM lighting geometry cannot be relied on.
- The public OSRM demo server has no production SLA and returns a driving-road route, not pedestrian navigation. Configure ORS or a production walking router before claiming pedestrian guidance.
- Twilio is unconfigured and unverified. SMS cannot be claimed as sent or delivered.
- No police dispatch exists.
- User, SafeWalk, and SOS backend state is in memory; profile/home are browser-local. There is no production database.
- Smart Check is foreground-only and does not survive page/app termination.
- Clerk uses development keys; production deployment is not configured.

### P2

- The frontend bundle is about 484 kB before gzip and could be route-split.
- Public safe-spot availability needs caching/backoff or a contracted provider.
- Physical-device accessibility and permission-denial rehearsals remain.

## Demo Script

1. **REAL / EXTERNAL SERVICE:** Sign in with Clerk and show the account-scoped safety profile.
2. **SIMULATED:** Click **Use Bengaluru demo location**; point out the visible demo banner and that live GPS was not silently replaced.
3. **REAL / EXTERNAL SERVICE:** Open Safe Route and click **Load Bengaluru demo route**, then **Find safer routes**. Show real OSRM geometry, distance, and duration.
4. **DEMO DATA:** Explain that the safety score samples the real geometry against synthetic incidents.
5. **REAL + ESTIMATE:** Choose the route and send it to SafeWalk. Explain that walking time is estimated from route distance, not live navigation.
6. **SIMULATED CONTROL:** Enable the explicit 15-second expiry demonstration and start SafeWalk.
7. **REAL PATHRAK EVENT:** Let expiry record exactly one SOS event. Show alert ID, station reference-only label, Twilio state, and `NOT_CONFIGURED` police dispatch.
8. **DEVICE DEPENDENT:** Show Call and SMS draft actions without claiming completion; then mark/reset safe.

## What Can Be Demonstrated Without Lying?

### Demo Ready

Clerk entry UI, explicit demo location, real map tiles, real OSRM road geometry, synthetic route-risk scoring, heatmap, route-linked SafeWalk, controlled exactly-once expiry, PathRak SOS recording, station-reference matching, deterministic lighting simulation, incident history, danger reports, and the disclosed Exit Call simulation.

### Demo Ready With Configuration

Authenticated backend flow requires the Clerk issuer and frontend publishable key. Production ORS routing requires `ORS_API_KEY`. Twilio SMS request submission requires all three Twilio variables.

### Demo Ready With Device

Live GPS, motion-triggered SOS, `tel:` calling, `sms:` drafting, vibration, notifications, and battery monitoring require a supported mobile browser and permissions.

### Still Broken

Safe Spots while Overpass is unavailable; authenticated browser E2E until a user signs in; live OSM lighting geometry while Overpass is unavailable; provider-generated pedestrian navigation.

### Not Implemented

Police dispatch, SMS delivery receipts/webhooks, durable database storage, background push monitoring, and guaranteed route alternatives.
