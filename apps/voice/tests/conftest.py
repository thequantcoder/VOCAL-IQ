"""Load the monorepo-root .env into os.environ for local test runs so the
skip-guarded live smokes (Deepgram/ElevenLabs/LiveKit) can find their keys. In CI
there is no .env file, so this is a no-op and the live smokes simply skip."""

from __future__ import annotations

from pathlib import Path

from dotenv import load_dotenv

_ROOT_ENV = Path(__file__).resolve().parents[3] / ".env"
load_dotenv(dotenv_path=_ROOT_ENV, override=False)
