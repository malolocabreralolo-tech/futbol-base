#!/usr/bin/env python3
"""Miniaturas de los escudos (spec §5.4; decisión 9 del plan B4), con Pillow.

Cada original escudos/<nombre>.<ext> da escudos/s/<nombre>.png, la imagen que la app pide primero
(crest() de src/ui.js: la miniatura; si falla, el original; si también falla, el monograma):
- girada como dice su EXIF (Orientation), como la pinta el navegador (hoy ningún original lleva giro);
- en sRGB: si el original trae un perfil ICC (hoy, 21 en Adobe RGB y uno en Display P3), se
  convierte, como hace el navegador al pintarlo; sin perfil, los valores tal cual (Chrome no aplica
  un cHRM suelto, sin gAMA);
- con el lado mayor en SIZE px como mucho (32 px CSS con DPR 3), sin ampliar nunca el original;
  LANCZOS, que Pillow aplica con el alfa premultiplicado;
- con una paleta de COLORS colores y su transparencia (FASTOCTREE): un tercio de los bytes de RGBA,
  sin diferencia visible a 16, 32 y 46 px CSS (la hoja de contacto de la Tarea 4 del plan B4);
- en PNG optimizado, con un bloque tEXt «escudo» que guarda el sha1 del original y la receta: así
  --check sabe, sin Pillow, si una miniatura falta, sobra o se quedó atrás (un original cambiado
  con el mismo nombre).

Se ejecuta a mano al añadir o cambiar un escudo, como build_icons.py, y trim_shields.py lo llama al
terminar si trajo alguno. El bot no toca escudos/ (data-shields.js se mantiene a mano): sin la miniatura,
Tests sale en rojo (test_build_crests.py), nunca el bot. Escribe solo las miniaturas que faltan o se
quedaron atrás y borra las que sobran.

Uso: python3 scripts/build_crests.py [--check] [--root R]
  --check: no escribe ni necesita Pillow; sale con 1 si falta, sobra o se quedó atrás alguna.
"""
import argparse
import hashlib
import io
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SIZE = 96
COLORS = 256
RECIPE = f"{SIZE}px octree{COLORS}"
TAG = "escudo"
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


def thumb_name(original: str) -> str:
    """El nombre de la miniatura: el del original sin su extensión, en .png (como crest() de ui.js)."""
    return Path(original).stem + ".png"


def thumb_size(width: int, height: int) -> tuple:
    """El tamaño de la miniatura: el lado mayor en SIZE como mucho, sin ampliar, con la misma forma."""
    scale = min(1.0, SIZE / max(width, height))
    return max(1, round(width * scale)), max(1, round(height * scale))


def source_tag(original: bytes) -> str:
    """Lo que la miniatura guarda de su original: su sha1 y la receta con la que se hizo."""
    return f"sha1={hashlib.sha1(original).hexdigest()} {RECIPE}"


def read_tag(png: bytes):
    """El texto del bloque tEXt «escudo» de un PNG, o None si no es un PNG o no lo tiene (sin Pillow)."""
    if not png.startswith(PNG_SIGNATURE):
        return None
    pos = len(PNG_SIGNATURE)
    while pos + 8 <= len(png):
        length, kind = struct.unpack(">I4s", png[pos:pos + 8])
        if kind == b"tEXt":
            key, _, value = png[pos + 8:pos + 8 + length].partition(b"\0")
            if key == TAG.encode("latin-1"):
                return value.decode("latin-1")
        if kind in (b"IDAT", b"IEND"):
            return None
        pos += 12 + length
    return None


def survey(root):
    """El estado de escudos/s/ frente a escudos/: {"colisiones", "pendientes": [(original, miniatura,
    "falta" | "atrás")], "sobran": [miniaturas], "al_dia": n}."""
    folder = Path(root) / "escudos"
    thumbs = folder / "s"
    originals = sorted(p for p in folder.iterdir() if p.is_file() and not p.name.startswith("."))
    by_thumb = {}
    for original in originals:
        by_thumb.setdefault(thumb_name(original.name), []).append(original)
    state = {"colisiones": [], "pendientes": [], "sobran": [], "al_dia": 0}
    for name, group in sorted(by_thumb.items()):
        if len(group) > 1:
            state["colisiones"].append(group)
            continue
        thumb = thumbs / name
        if not thumb.is_file():
            state["pendientes"].append((group[0], thumb, "falta"))
        elif read_tag(thumb.read_bytes()) != source_tag(group[0].read_bytes()):
            state["pendientes"].append((group[0], thumb, "atrás"))
        else:
            state["al_dia"] += 1
    if thumbs.is_dir():
        state["sobran"] = sorted(p for p in thumbs.iterdir() if p.is_file() and p.name not in by_thumb)
    return state


def make_thumbnail(original: Path, target: Path):
    """Escribe la miniatura de `original` en `target` (con Pillow). `ImageCms.PyCMSError` y un original que
    Pillow no abre suben tal cual: `main` los captura por fichero y sigue con los demás."""
    from PIL import Image, ImageCms, ImageOps, PngImagePlugin

    data = original.read_bytes()
    with Image.open(io.BytesIO(data)) as im:
        icc = im.info.get("icc_profile")
        im = ImageOps.exif_transpose(im)
        if im.mode in ("I", "I;16"):  # grises de 16 bits: a 8 bits antes de convertir, si no sale blanca
            im = im.point(lambda v: v * (1 / 256)).convert("L")
        image = im.convert("RGBA")
    if icc:
        source = ImageCms.ImageCmsProfile(io.BytesIO(icc))
        space = source.profile.xcolor_space.strip()
        if space == "RGB":
            image = ImageCms.profileToProfile(image, source, ImageCms.createProfile("sRGB"), outputMode="RGBA")
        else:
            # profileToProfile no vale sobre RGBA con un perfil que no sea RGB (PyCMSError: cannot build
            # transform). Sin perfil, como si no lo trajera: los valores tal cual (ya está en RGBA de su modo).
            print(f"{original.name}: perfil ICC {space} (no RGB), se ignora")
    size = thumb_size(*image.size)
    if size != image.size:
        image = image.resize(size, Image.Resampling.LANCZOS)
    palette = image.quantize(colors=COLORS, method=Image.Quantize.FASTOCTREE)
    info = PngImagePlugin.PngInfo()
    info.add_text(TAG, source_tag(data))
    target.parent.mkdir(parents=True, exist_ok=True)
    # Sin perfil ICC (el de sRGB que deja la conversión): sin perfil, el navegador ya la pinta en sRGB.
    palette.save(target, "PNG", optimize=True, pnginfo=info, icc_profile=None)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Miniaturas de los escudos: escudos/s/<nombre>.png")
    parser.add_argument("--check", action="store_true", help="no escribe: sale con 1 si falta, sobra o se quedó atrás alguna")
    parser.add_argument("--root", default=str(ROOT), help="raíz del repo (por defecto, la de este guion)")
    args = parser.parse_args(argv)
    root = Path(args.root)
    state = survey(root)
    rel = lambda p: p.relative_to(root).as_posix()  # noqa: E731
    for group in state["colisiones"]:
        print(f"mismo nombre: {' y '.join(rel(p) for p in group)} darían escudos/s/{thumb_name(group[0].name)}")
    if args.check:
        for original, thumb, why in state["pendientes"]:
            print(f"{'falta' if why == 'falta' else 'se quedó atrás'}: {rel(thumb)} (de {rel(original)})")
        for extra in state["sobran"]:
            print(f"sobra: {rel(extra)}")
        problems = len(state["colisiones"]) + len(state["pendientes"]) + len(state["sobran"])
        print(f"escudos/s: {state['al_dia']} al día" + (f", {problems} por arreglar: python3 scripts/build_crests.py" if problems else ""))
        return 1 if problems else 0
    if state["colisiones"]:
        return 1
    try:
        import PIL  # noqa: F401
    except ImportError:
        print("build_crests.py necesita Pillow: pip install Pillow")
        return 1
    from PIL import ImageCms, UnidentifiedImageError
    failed = 0
    for original, thumb, _ in state["pendientes"]:
        try:
            make_thumbnail(original, thumb)
        except (ImageCms.PyCMSError, UnidentifiedImageError) as exc:
            print(f"no se pudo: {original.name}: {exc}")
            failed += 1
            continue
        print(f"escrita: {rel(thumb)}")
    for extra in state["sobran"]:
        extra.unlink()
        print(f"borrada: {rel(extra)}")
    summary = f"escudos/s: {len(state['pendientes']) - failed} escritas, {state['al_dia']} al día, {len(state['sobran'])} borradas"
    print(summary + (f", {failed} con error" if failed else ""))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
