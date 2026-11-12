#!/usr/bin/env python3
"""Run the local update: wait for LM Studio, then run local_full_update.py.

Handles:
  - venv re-exec (uses .venv/bin/python when available)
  - single-instance lock (logs/local_update.lock)
  - waiting for LM Studio to come up (machine sleep / LM Studio closed)
  - streaming output to logs/update.log (and console)
  - resume: local_full_update.py checkpoints per repo, so re-running after a
    shutdown/sleep continues where it stopped; git push happens on completion.

Usage:
    python3 scripts/run_local_update.py            # wait up to 45 min for LM Studio
    python3 scripts/run_local_update.py --wait 120 # custom wait minutes
    python3 scripts/run_local_update.py --now      # fail fast if LM Studio is down
"""
from __future__ import annotations

import os
import subprocess
import sys
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
VENV_PY = ROOT / ".venv" / "bin" / "python"
LOCK = ROOT / "logs" / "local_update.lock"
LOG = ROOT / "logs" / "update.log"
ENV_FILE = ROOT / ".env"


def load_env() -> None:
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())


def llm_up(base_url: str) -> bool:
    try:
        r = requests.get(f"{base_url}/v1/models", timeout=8)
        return r.status_code == 200
    except Exception:  # noqa: BLE001
        return False


def main() -> int:
    wait_min = 45
    args = sys.argv[1:]
    if "--wait" in args:
        wait_min = int(args[args.index("--wait") + 1])
    fail_fast = "--now" in args

    # Re-exec under the venv python if needed (dotenv/requests live there)
    if VENV_PY.exists() and Path(sys.executable) != VENV_PY:
        os.execv(str(VENV_PY), [str(VENV_PY), str(Path(__file__).resolve()), *args])

    load_env()
    base_url = os.environ.get("LLM_BASE_URL", "http://localhost:1234")

    # Single-instance lock
    if LOCK.exists():
        try:
            old_pid = int(LOCK.read_text().strip())
            os.kill(old_pid, 0)  # still alive?
            print(f"Another run is in progress (PID {old_pid}). Exiting.")
            return 0
        except (ValueError, ProcessLookupError, PermissionError):
            pass  # stale lock
    LOCK.parent.mkdir(parents=True, exist_ok=True)
    LOCK.write_text(str(os.getpid()))

    try:
        # Wait for LM Studio
        deadline = time.time() + wait_min * 60
        while not llm_up(base_url):
            if fail_fast:
                print(f"LM Studio not reachable at {base_url} — exiting (--now).")
                return 2
            if time.time() > deadline:
                print(f"LM Studio still down after {wait_min} min — exiting.")
                return 2
            print(f"Waiting for LM Studio at {base_url} …", flush=True)
            time.sleep(20)
        print(f"LM Studio is up at {base_url}")

        LOG.parent.mkdir(parents=True, exist_ok=True)
        with open(LOG, "a", encoding="utf-8") as logf:
            logf.write(f"\n===== run {time.strftime('%Y-%m-%d %H:%M:%S')} =====\n")
            logf.flush()
            proc = subprocess.run(
                [str(VENV_PY), str(ROOT / "scripts" / "local_full_update.py")],
                cwd=ROOT,
                stdout=logf,
                stderr=subprocess.STDOUT,
            )
        print(f"local_full_update.py exited with {proc.returncode} (see {LOG.relative_to(ROOT)})")
        return proc.returncode
    finally:
        if LOCK.exists():
            try:
                LOCK.unlink()
            except OSError:
                pass


if __name__ == "__main__":
    raise SystemExit(main())