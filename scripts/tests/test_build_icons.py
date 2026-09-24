"""Plan B1, tarea 13: iconos de la PWA (spec §5.5).

Tamaño y modo se comprueban leyendo la cabecera PNG a mano, sin Pillow: el bot
(update.yml) y tests.yml solo instalan pytest y pyyaml. Las comprobaciones de
píxeles y de regeneración usan Pillow y se saltan si no está instalado.
"""
import struct
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
ICONS = ROOT / "icons"
EXPECTED = {
    "icon-180.png": 180,
    "icon-192.png": 192,
    "icon-512.png": 512,
    "icon-maskable-512.png": 512,
}
INK = (0xC0, 0x18, 0x2B)
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


def _ihdr(path):
    data = path.read_bytes()
    assert data[:8] == PNG_SIGNATURE, f"{path.name} no es un PNG"
    length, kind = struct.unpack(">I4s", data[8:16])
    assert (length, kind) == (13, b"IHDR"), f"{path.name}: IHDR no es el primer bloque"
    return struct.unpack(">IIBBBBB", data[16:29])


@pytest.mark.parametrize("name,side", sorted(EXPECTED.items()))
def test_icon_size_and_mode(name, side):
    width, height, depth, color_type, _compression, _filter, interlace = _ihdr(ICONS / name)
    assert (width, height) == (side, side)
    assert (depth, color_type) == (8, 2), "RGB de 8 bits, opaco (sin canal alfa)"
    assert interlace == 0


@pytest.mark.parametrize("name", sorted(EXPECTED))
def test_icon_is_light(name):
    # Se precachean en el service worker (B4): nada de PNG pesados.
    assert (ICONS / name).stat().st_size < 20_000


@pytest.mark.parametrize("name", sorted(EXPECTED))
def test_icon_ink_background_with_white_mark(name):
    Image = pytest.importorskip("PIL.Image")
    img = Image.open(ICONS / name).convert("RGB")
    side = img.width
    for corner in [(0, 0), (side - 1, 0), (0, side - 1), (side - 1, side - 1)]:
        assert img.getpixel(corner) == INK, f"{name}: esquina {corner} sin tinta"
    white = sum(img.convert("L").histogram()[240:])  # la tinta da L≈76; el blanco, 255
    assert white / (side * side) > 0.03, f"{name}: la marca blanca no se ve"


def test_maskable_mark_inside_safe_zone():
    Image = pytest.importorskip("PIL.Image")
    img = Image.open(ICONS / "icon-maskable-512.png").convert("RGB")
    side = img.width
    center, radius = side / 2, 0.40 * side
    px = img.load()
    outside = [
        (x, y)
        for y in range(side)
        for x in range(side)
        if (x + 0.5 - center) ** 2 + (y + 0.5 - center) ** 2 > radius**2 and px[x, y] != INK
    ]
    assert not outside, f"{len(outside)} píxeles de la marca fuera de la zona segura, p. ej. {outside[:3]}"


def test_build_icons_reproduces_committed_files(tmp_path):
    pytest.importorskip("PIL")
    from PIL import Image, ImageChops, ImageStat

    from scripts.build_icons import build

    written = build(tmp_path)
    assert sorted(p.name for p in written) == sorted(EXPECTED)
    for name in EXPECTED:
        fresh = Image.open(tmp_path / name).convert("RGB")
        committed = Image.open(ICONS / name).convert("RGB")
        assert fresh.size == committed.size
        diff = ImageStat.Stat(ImageChops.difference(fresh, committed)).mean
        assert max(diff) < 1.0, f"{name}: los iconos del repo no salen de build_icons.py ({diff})"