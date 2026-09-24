#!/usr/bin/env python3
"""Genera los iconos de la PWA (spec §5.5) con Pillow.

Marca: un campo de fútbol en blanco (bandas, línea de medio campo, círculo
central y las dos áreas) sobre la tinta roja del sistema «Acta» (#C0182B).
Se dibuja a 4 aumentos y se reduce con LANCZOS para suavizar los bordes.

- icons/icon-180.png: apple-touch-icon (opaco; iOS redondea las esquinas).
- icons/icon-192.png e icons/icon-512.png: purpose "any".
- icons/icon-maskable-512.png: purpose "maskable"; la marca cabe entera en la
  zona segura, un círculo de radio 0,4 del lado.

Uso: python3 scripts/build_icons.py [directorio]   (por defecto, icons/)
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
INK = (0xC0, 0x18, 0x2B)
WHITE = (0xFF, 0xFF, 0xFF)
SCALE = 4
ASPECT = 0.64  # ancho / alto del campo
# nombre: (lado en px, alto del campo en fracción del lado)
ICONS = {
    "icon-180.png": (180, 0.70),
    "icon-192.png": (192, 0.70),
    "icon-512.png": (512, 0.70),
    "icon-maskable-512.png": (512, 0.56),
}


def draw_icon(side, field_height):
    big = side * SCALE
    img = Image.new("RGB", (big, big), INK)
    d = ImageDraw.Draw(img)
    h = field_height * big
    w = ASPECT * h
    stroke = round(w / 13)  # proporcional al campo: el maskable conserva el trazo relativo
    cx = cy = big / 2
    x0, y0, x1, y1 = cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2
    d.rectangle([x0, y0, x1, y1], outline=WHITE, width=stroke)
    d.line([(x0, cy), (x1, cy)], fill=WHITE, width=stroke)
    r = 0.24 * w
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=WHITE, width=stroke)
    area_w, area_h = 0.60 * w, 0.16 * h
    d.rectangle([cx - area_w / 2, y0, cx + area_w / 2, y0 + area_h], outline=WHITE, width=stroke)
    d.rectangle([cx - area_w / 2, y1 - area_h, cx + area_w / 2, y1], outline=WHITE, width=stroke)
    return img.resize((side, side), Image.LANCZOS)


def build(out_dir=ROOT / "icons"):
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    written = []
    for name, (side, field_height) in ICONS.items():
        path = out / name
        draw_icon(side, field_height).save(path, optimize=True)
        written.append(path)
    return written


if __name__ == "__main__":
    for path in build(*sys.argv[1:2]):
        print(path.relative_to(ROOT) if path.is_relative_to(ROOT) else path)