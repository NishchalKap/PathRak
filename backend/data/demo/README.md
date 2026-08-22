# PathRak Demo Data

These files are **DEMO DATASETS**. They must not be represented as real-world
incident statistics, verified police records, or operational dispatch data.

## incidents.csv

- Provenance: restored unchanged from local Git commit `49c03d2`.
- Classification: synthetic/demo data.
- Generation evidence: `backend/scripts/generate_demo_data.py` generated 5,000
  Bengaluru and 2,000 Mysore records with random coordinates and heuristic risk
  labels. The remaining 200 Delhi rows have no documented public source and are
  therefore also treated as demo data.
- Required model columns: `incident_type`, `lighting`, `hour`, `day_of_week`,
  `risk_level`, `lat`, and `lng`.

## police_stations.csv

- Provenance: restored unchanged from local Git commit `49c03d2`.
- Classification: unverified demo reference data.
- No source or verification record exists for its station names, coordinates, or
  contact numbers. PathRak must not claim that selecting a row dispatched an SOS
  to that station.

Set `PATHRAK_DATA_MODE=demo` to use these files. Real deployments must set
`PATHRAK_DATA_MODE=real` and point `PATHRAK_REAL_DATA_DIR` to a separately
verified dataset directory with compatible schemas.
