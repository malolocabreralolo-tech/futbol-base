#!/usr/bin/env python3
"""Purge empty acta entries from fiflp_actas_*_raw.json files.

FIFLP serves ~40-byte empty framesets as anti-scrape; older runs of
fetch_fiflp_actas.py persisted those parses (all-None header, empty lineups)
into the raw JSONs, and the resume logic then skipped them forever. This CLI
removes such entries so the next harvest retries them.

Usage:
    python3 scripts/purge_empty_actas.py [raw.json ...]

Without arguments it processes every scripts/fiflp_actas_*_raw.json.
"""
import glob
import json
import os
import sys

# Make `scripts.` imports work both from the repo root and as a direct CLI run.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from scripts.fetch_fiflp_actas import is_empty_acta  # noqa: E402


def purge_file(path: str) -> int:
    """Remove empty acta entries from one raw JSON. Returns how many were purged."""
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    dead = [k for k, v in data.items() if is_empty_acta(v)]
    for k in dead:
        del data[k]
    if dead:
        with open(path, "w", encoding="utf-8") as f:
            f.write(json.dumps(data, ensure_ascii=False, indent=2))
    return len(dead)


def main(argv=None) -> int:
    args = sys.argv[1:] if argv is None else argv
    if args:
        paths = args
    else:
        paths = sorted(glob.glob(
            os.path.join(os.path.dirname(os.path.abspath(__file__)),
                         "fiflp_actas_*_raw.json")
        ))
    if not paths:
        print("No raw files found.")
        return 0
    total = 0
    for p in paths:
        n = purge_file(p)
        total += n
        print(f"{p}: purged {n} empty acta(s)")
    print(f"TOTAL purged: {total}")
    return total


if __name__ == "__main__":
    main()
