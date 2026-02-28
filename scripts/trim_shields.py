#!/usr/bin/env python3
"""
trim_shields.py — Download shield images from futbolaspalmas.com,
trim transparent borders, and save locally in escudos/ directory.
Updates data-shields.js to use local paths.

Usage: python3 scripts/trim_shields.py
"""

import json
import os
import re
import time
import urllib.request
from PIL import Image
from io import BytesIO

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHIELDS_PATH = os.path.join(PROJECT_ROOT, "data-shields.js")
ESCUDOS_DIR = os.path.join(PROJECT_ROOT, "escudos")
BASE_URL = "https://futbolaspalmas.com/escudos/"
DELAY = 0.15


def fetch_image(url):
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                      "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    })
    with urllib.request.urlopen(req, timeout=20) as r:
        return r.read()


def trim_transparent(img):
    """Trim transparent borders from a PIL Image, keeping a 2px margin."""
    if img.mode != "RGBA":
        img = img.convert("RGBA")
    # Get bounding box of non-transparent pixels
    bbox = img.getbbox()
    if bbox is None:
        return img
    # Add small margin
    margin = 2
    x0 = max(0, bbox[0] - margin)
    y0 = max(0, bbox[1] - margin)
    x1 = min(img.width, bbox[2] + margin)
    y1 = min(img.height, bbox[3] + margin)
    cropped = img.crop((x0, y0, x1, y1))
    # Make square by padding the shorter side
    w, h = cropped.size
    if w != h:
        size = max(w, h)
        square = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        square.paste(cropped, ((size - w) // 2, (size - h) // 2))
        return square
    return cropped


def main():
    # Read current shields mapping
    with open(SHIELDS_PATH, encoding="utf-8") as f:
        content = f.read()
    m = re.search(r"const SHIELDS=(\{.*?\});", content, re.DOTALL)
    if not m:
        print("ERROR: SHIELDS not found in data-shields.js")
        return
    shields = json.loads(m.group(1))

    os.makedirs(ESCUDOS_DIR, exist_ok=True)

    downloaded = 0
    skipped = 0
    failed = 0

    for team, filename in shields.items():
        # Normalize filename for local storage (remove size prefixes)
        local_name = re.sub(r'^\d+x\d+', '', filename)
        local_path = os.path.join(ESCUDOS_DIR, local_name)

        if os.path.exists(local_path):
            skipped += 1
            continue

        url = BASE_URL + filename
        try:
            raw = fetch_image(url)
            img = Image.open(BytesIO(raw))
            trimmed = trim_transparent(img)
            # Resize to 64x64 for consistent size and small file
            trimmed = trimmed.resize((64, 64), Image.LANCZOS)
            trimmed.save(local_path, "PNG", optimize=True)
            downloaded += 1
            if downloaded % 20 == 0:
                print(f"  {downloaded} descargados...")
            time.sleep(DELAY)
        except Exception as e:
            print(f"  ⚠ {team}: {e}")
            failed += 1

    print(f"\n→ {downloaded} descargados, {skipped} ya existentes, {failed} fallidos")

    # Update SHIELDS mapping to use local paths
    local_shields = {}
    for team, filename in shields.items():
        local_name = re.sub(r'^\d+x\d+', '', filename)
        local_shields[team] = local_name

    new_content = (
        "const SHIELDS="
        + json.dumps(local_shields, ensure_ascii=False, separators=(",", ":"))
        + ";\n"
    )
    with open(SHIELDS_PATH, "w", encoding="utf-8") as f:
        f.write(new_content)
    print(f"→ data-shields.js actualizado con nombres locales ({len(local_shields)} equipos)")


if __name__ == "__main__":
    main()
