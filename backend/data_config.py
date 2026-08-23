import os
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parent
IS_VERCEL = os.getenv("VERCEL") == "1"
DATA_MODE = os.getenv("PATHRAK_DATA_MODE", "demo").strip().lower()

if DATA_MODE not in {"demo", "real"}:
    raise ValueError("PATHRAK_DATA_MODE must be either 'demo' or 'real'.")

if DATA_MODE == "demo":
    DATA_DIR = BACKEND_DIR / "data" / "demo"
else:
    configured_dir = os.getenv("PATHRAK_REAL_DATA_DIR", "").strip()
    DATA_DIR = (
        Path(configured_dir).expanduser().resolve()
        if configured_dir
        else BACKEND_DIR / "data" / "real"
    )

# Vercel's deployed filesystem is read-only except for ephemeral /tmp storage.
RUNTIME_DATA_DIR = Path("/tmp") if IS_VERCEL else BACKEND_DIR / "data"
DANGER_PINS_FILE = RUNTIME_DATA_DIR / "pathrak_danger_pins.json"


def data_metadata() -> dict:
    return {
        "data_mode": DATA_MODE.upper(),
        "data_disclaimer": (
            "Synthetic and unverified demo data; not real-world safety or police dispatch data."
            if DATA_MODE == "demo"
            else "Real-data mode selected; data is operator-supplied and not verified by PathRak."
        ),
    }
