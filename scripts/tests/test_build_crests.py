"""Plan B4, Tarea 4: las miniaturas de los escudos (spec §5.4; decisiones 9, 51 y 56).

Sin Pillow, salvo dos (el CI y el bot solo instalan pytest y pyyaml): las cabeceras de los PNG (IHDR) y
de los JPEG (SOF, y el giro de su EXIF) se leen a mano, y `build_crests.py --check` compara los nombres y
el sha1 que cada miniatura guarda de su original, con la receta, en su bloque tEXt «escudo».

Las que leen escudos/ tal como está (LIVE) se saltan dentro de un bot. update.yml y fetch-fiflp*.yml
ejecutan pytest antes de comitear los datos y se paran en rojo, y el bot nunca toca escudos/: un escudo
añadido o cambiado a mano en main sin su miniatura no puede dejar de publicar los datos. En local y en
Tests (que corre también cuando solo cambia escudos/) siguen estrictas, y trim_shields.py ya hace las
miniaturas de lo que trae; a mano, `python3 scripts/build_crests.py`.
"""
import io
import os
import re
import shutil
import struct
import subprocess
import sys
import zlib
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))
import build_crests  # noqa: E402

ESCUDOS = ROOT / "escudos"
THUMBS = ESCUDOS / "s"
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
JPEG_SOF = {0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF}
ORIGINALS = sorted(p for p in ESCUDOS.iterdir() if p.is_file() and not p.name.startswith("."))


def _strict(environ):
    """Si las pruebas de escudos/ tal como está paran la suite: en local (sin GITHUB_WORKFLOW) y en Tests, sí;
    dentro de un bot, no. GitHub Actions pone en GITHUB_WORKFLOW el `name:` del workflow: «Actualización
    automática» (update.yml), «Scraping FIFLP», «Scrape FIFLP actas (incremental)»…"""
    return environ.get("GITHUB_WORKFLOW") in (None, "Tests")


LIVE = pytest.mark.skipif(not _strict(os.environ),
                          reason="el bot no toca escudos/: un escudo sin su miniatura lo para Tests, nunca el bot")


def _png_header(data):
    """(ancho, alto, profundidad, tipo de color) del IHDR, que tiene que ser el primer bloque."""
    assert data[:8] == PNG_SIGNATURE, "no es un PNG"
    assert struct.unpack(">I4s", data[8:16]) == (13, b"IHDR"), "el primer bloque no es IHDR"
    return struct.unpack(">IIBB", data[16:26])


def _jpeg_size(data):
    """(ancho, alto) con que se pinta un JPEG: los de su primer SOF (los segmentos van antes de los datos de
    la imagen), girados si su EXIF lo pide (Orientation de 5 a 8, un cuarto de vuelta), como el navegador y
    como build_crests.py."""
    assert data[:2] == b"\xff\xd8", "no es un JPEG"
    pos, turned = 2, False
    while pos + 9 <= len(data):
        assert data[pos] == 0xFF, f"JPEG mal formado en el byte {pos}"
        marker = data[pos + 1]
        if marker == 0xFF:  # relleno
            pos += 1
            continue
        length = struct.unpack(">H", data[pos + 2:pos + 4])[0]
        if marker == 0xE1 and data[pos + 4:pos + 10] == b"Exif\0\0":
            turned = _exif_orientation(data[pos + 10:pos + 2 + length]) in (5, 6, 7, 8)
        if marker in JPEG_SOF:
            height, width = struct.unpack(">HH", data[pos + 5:pos + 9])
            return (height, width) if turned else (width, height)
        pos += 2 + length
    raise AssertionError("JPEG sin SOF")


def _exif_orientation(tiff):
    """La etiqueta Orientation (0x0112) del primer IFD de un bloque EXIF (una cabecera TIFF), o 1 sin ella."""
    order = {b"II": "<", b"MM": ">"}[tiff[:2]]
    ifd = struct.unpack(order + "I", tiff[4:8])[0]
    for i in range(struct.unpack(order + "H", tiff[ifd:ifd + 2])[0]):
        tag, _, _, value = struct.unpack(order + "HHI4s", tiff[ifd + 2 + 12 * i:ifd + 14 + 12 * i])
        if tag == 0x0112:
            return struct.unpack(order + "H", value[:2])[0]
    return 1


def _size(path):
    data = path.read_bytes()
    return _png_header(data)[:2] if data[:8] == PNG_SIGNATURE else _jpeg_size(data)


def _minimal_icc(colorspace):
    """Un perfil ICC válido mínimo (sin tags) del espacio de color pedido (p.ej. b"GRAY", b"CMYK"): a
    ImageCms.ImageCmsProfile le basta la cabecera para abrirlo y dar su xcolor_space."""
    header = bytearray(128)
    struct.pack_into(">I", header, 8, 0x02100000)  # versión 2.1.0
    header[12:16] = b"prtr"
    header[16:20] = colorspace
    header[20:24] = b"XYZ "
    header[36:40] = b"acsp"  # firma obligatoria de la cabecera ICC

    def s15f16(value):
        return struct.pack(">i", round(value * 65536))

    header[68:72], header[72:76], header[76:80] = s15f16(0.9642), s15f16(1.0), s15f16(0.8249)  # iluminante D50
    data = bytearray(bytes(header) + struct.pack(">I", 0))  # tabla de tags vacía
    struct.pack_into(">I", data, 0, len(data))
    return bytes(data)


def _png_with_tag(tag):
    """Un PNG mínimo (1×1, con paleta) con el bloque tEXt «escudo», escrito sin Pillow."""
    def chunk(kind, body):
        return struct.pack(">I", len(body)) + kind + body + struct.pack(">I", zlib.crc32(kind + body))
    return (PNG_SIGNATURE + chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 3, 0, 0, 0)) + chunk(b"PLTE", b"\0\0\0")
            + chunk(b"tEXt", b"escudo\0" + tag.encode("latin-1")) + chunk(b"IDAT", zlib.compress(b"\0\0")) + chunk(b"IEND", b""))


def test_thumb_name_is_the_one_crest_asks_for():
    # crest() de src/ui.js pide ./escudos/s/<fichero sin su última extensión>.png
    assert "./escudos/s/${file.replace(/\\.[^./]+$/, '')}.png" in (ROOT / "src" / "ui.js").read_text(encoding="utf-8")
    assert build_crests.thumb_name("huracan.png") == "huracan.png"
    assert build_crests.thumb_name("joveroLasRosas.jpg") == "joveroLasRosas.png"
    assert build_crests.thumb_name("200x200atleticograncanaria19-20.png") == "200x200atleticograncanaria19-20.png"
    assert build_crests.thumb_name("a.b.jpeg") == "a.b.png"


def test_thumb_size_never_enlarges_and_keeps_the_shape():
    assert build_crests.SIZE == 96
    cases = {(64, 64): (64, 64), (96, 96): (96, 96), (100, 100): (96, 96), (300, 300): (96, 96),
             (722, 592): (96, 79), (150, 220): (65, 96), (200, 205): (94, 96), (500, 2): (96, 1)}
    for (width, height), expected in cases.items():
        assert build_crests.thumb_size(width, height) == expected, (width, height)


@LIVE
def test_header_readers_on_known_files():
    assert _size(ROOT / "icons" / "icon-180.png") == (180, 180)
    assert _size(ESCUDOS / "joveroLasRosas.jpg") == (150, 220)
    assert _size(ESCUDOS / "football-project.jpg") == (722, 592)


@LIVE
def test_every_original_has_its_thumbnail_and_every_thumbnail_its_original():
    wanted = {build_crests.thumb_name(p.name) for p in ORIGINALS}
    present = {p.name for p in THUMBS.iterdir()} if THUMBS.is_dir() else set()
    assert len(ORIGINALS) >= 176
    assert sorted(wanted - present) == [], "faltan miniaturas: python3 scripts/build_crests.py"
    assert sorted(present - wanted) == [], "sobran miniaturas: python3 scripts/build_crests.py"


@LIVE
def test_no_two_originals_share_a_name_without_extension():
    by_thumb = {}
    for original in ORIGINALS:
        by_thumb.setdefault(build_crests.thumb_name(original.name), []).append(original.name)
    assert [names for names in by_thumb.values() if len(names) > 1] == []


@LIVE
def test_thumbnails_are_palette_pngs_with_the_longest_side_at_most_96():
    wrong = []
    for original in ORIGINALS:
        thumb = THUMBS / build_crests.thumb_name(original.name)
        if not thumb.is_file():
            continue  # lo dice la prueba de los nombres
        width, height, depth, color = _png_header(thumb.read_bytes())
        ow, oh = _size(original)
        if ((width, height) != build_crests.thumb_size(ow, oh) or max(width, height) > 96 or width > ow or height > oh
                or color != 3 or depth not in (1, 2, 4, 8)):
            wrong.append(f"{thumb.name}: {width}×{height}, tipo {color} de {depth} bits (original {ow}×{oh})")
    assert wrong == []


@LIVE
def test_thumbnails_are_up_to_date_with_their_originals(capsys):
    # Sin Pillow: el sha1 del original y la receta, guardados en cada miniatura.
    assert build_crests.main(["--check"]) == 0, capsys.readouterr().out
    assert capsys.readouterr().out == f"escudos/s: {len(ORIGINALS)} al día\n"


@LIVE
def test_check_runs_without_pillow():
    # Como en el CI: sin Pillow, --check funciona igual (Pillow solo hace falta para escribir).
    code = ("import sys; sys.modules['PIL'] = None; sys.path.insert(0, 'scripts'); import build_crests;"
            " raise SystemExit(build_crests.main(['--check']))")
    run = subprocess.run([sys.executable, "-c", code], cwd=ROOT, capture_output=True, text=True)
    assert run.returncode == 0, run.stdout + run.stderr


def test_check_finds_missing_stale_extra_and_clashing_thumbnails(tmp_path, capsys):
    thumbs = tmp_path / "escudos" / "s"
    thumbs.mkdir(parents=True)
    original = b"el original de a"
    (tmp_path / "escudos" / "a.png").write_bytes(original)

    def check():
        return build_crests.main(["--check", "--root", str(tmp_path)]), capsys.readouterr().out

    assert check() == (1, "falta: escudos/s/a.png (de escudos/a.png)\nescudos/s: 0 al día, 1 por arreglar: python3 scripts/build_crests.py\n")
    (thumbs / "a.png").write_bytes(_png_with_tag(build_crests.source_tag(original)))
    assert check() == (0, "escudos/s: 1 al día\n")
    # El mismo nombre con otro contenido, o la misma fuente con otra receta: se quedó atrás.
    (tmp_path / "escudos" / "a.png").write_bytes(b"otro original de a")
    code, out = check()
    assert code == 1 and "se quedó atrás: escudos/s/a.png (de escudos/a.png)" in out
    (tmp_path / "escudos" / "a.png").write_bytes(original)
    (thumbs / "a.png").write_bytes(_png_with_tag(build_crests.source_tag(original).replace("96px", "64px")))
    code, out = check()
    assert code == 1 and "se quedó atrás: escudos/s/a.png" in out
    (thumbs / "a.png").write_bytes(_png_with_tag(build_crests.source_tag(original)))
    (thumbs / "b.png").write_bytes(_png_with_tag("x"))
    code, out = check()
    assert code == 1 and "sobra: escudos/s/b.png" in out
    (thumbs / "b.png").unlink()
    (tmp_path / "escudos" / "a.jpg").write_bytes(b"a en JPEG")
    code, out = check()
    assert code == 1 and "mismo nombre: escudos/a.jpg y escudos/a.png darían escudos/s/a.png" in out


@LIVE
def test_build_writes_srgb_thumbnails_and_only_what_changed(tmp_path, capsys):
    Image = pytest.importorskip("PIL.Image")
    from PIL import ImageCms

    (tmp_path / "escudos").mkdir()
    for name in ("lasMesasEscudo.png", "football-project.jpg", "100x100arucas.png"):
        (tmp_path / "escudos" / name).write_bytes((ESCUDOS / name).read_bytes())
    assert build_crests.main(["--root", str(tmp_path)]) == 0
    assert capsys.readouterr().out.splitlines()[-1] == "escudos/s: 3 escritas, 0 al día, 0 borradas"
    assert build_crests.main(["--root", str(tmp_path)]) == 0
    assert capsys.readouterr().out == "escudos/s: 0 escritas, 3 al día, 0 borradas\n"
    # Las Mesas trae un perfil Adobe RGB: la miniatura (64×64, como el original) lleva los colores que
    # pinta el navegador, los del perfil convertidos a sRGB, y ningún perfil.
    original = Image.open(ESCUDOS / "lasMesasEscudo.png")
    profile = ImageCms.ImageCmsProfile(io.BytesIO(original.info["icc_profile"]))
    srgb = ImageCms.profileToProfile(original.convert("RGBA"), profile, ImageCms.createProfile("sRGB"), outputMode="RGBA")
    thumb = Image.open(tmp_path / "escudos" / "s" / "lasMesasEscudo.png")
    assert "icc_profile" not in thumb.info and thumb.mode == "P"

    def mean_gap(a, b):
        # La diferencia media por canal en los píxeles opacos de `a`.
        pa, pb = a.convert("RGBA").tobytes(), b.convert("RGBA").tobytes()
        opaque = [i for i in range(0, len(pa), 4) if pa[i + 3] == 255]
        return sum(abs(pa[i + k] - pb[i + k]) for i in opaque for k in range(3)) / (3 * len(opaque))

    assert mean_gap(srgb, thumb) < 5, "la paleta de 256 colores da unos 3"
    assert mean_gap(original, thumb) > 10, "sin convertir, los valores del perfil Adobe RGB darían unos 13"
    # Un original que se va se lleva su miniatura.
    (tmp_path / "escudos" / "100x100arucas.png").unlink()
    assert build_crests.main(["--root", str(tmp_path)]) == 0
    assert capsys.readouterr().out == "borrada: escudos/s/100x100arucas.png\nescudos/s: 0 escritas, 2 al día, 1 borradas\n"


@LIVE
def test_a_crest_without_its_thumbnail_stops_tests_and_never_the_bots(tmp_path):
    # Una copia del árbol con un escudo nuevo sin su miniatura (un commit a mano en main): con
    # GITHUB_WORKFLOW=Tests fallan las tres pruebas que lo miran; dentro del bot (update.yml) se saltan
    # todas las de escudos/ y ninguna falla, así que el bot sigue publicando los datos.
    for rel in ("scripts/build_crests.py", "scripts/tests/test_build_crests.py", "src/ui.js", "icons/icon-180.png"):
        (tmp_path / rel).parent.mkdir(parents=True, exist_ok=True)
        shutil.copy(ROOT / rel, tmp_path / rel)
    shutil.copytree(ESCUDOS, tmp_path / "escudos")
    shutil.copy(ESCUDOS / "lasMesasEscudo.png", tmp_path / "escudos" / "nuevoClubEscudo.png")

    def summary(workflow):
        env = {key: value for key, value in os.environ.items() if key != "GITHUB_WORKFLOW"}
        env["GITHUB_WORKFLOW"] = workflow
        run = subprocess.run([sys.executable, "-m", "pytest", "-q", "-p", "no:cacheprovider", "-k", "not never_the_bots",
                              "scripts/tests/test_build_crests.py"], cwd=tmp_path, env=env, capture_output=True, text=True)
        return run.stdout.strip().splitlines()[-1]

    in_tests = summary("Tests")
    assert in_tests.startswith("3 failed, "), in_tests
    in_the_bot = summary("Actualización automática")
    assert "failed" not in in_the_bot and int(re.search(r"(\d+) skipped", in_the_bot).group(1)) >= 7, in_the_bot


def test_build_turns_a_photo_as_its_exif_says(tmp_path):
    # Un JPEG de cámara con Orientation 6 (se pinta girado un cuarto de vuelta a la derecha): 80×40 en el fichero,
    # 40×80 al pintarlo, con su mitad izquierda (azul) arriba. La miniatura sale como se pinta, y la cabecera,
    # leída a mano, da ese mismo tamaño.
    Image = pytest.importorskip("PIL.Image")
    photo = Image.new("RGB", (80, 40), (220, 30, 30))
    photo.paste((30, 30, 220), (0, 0, 40, 40))
    exif = Image.Exif()
    exif[0x0112] = 6
    jpeg = io.BytesIO()
    photo.save(jpeg, "JPEG", exif=exif)
    (tmp_path / "escudos").mkdir()
    (tmp_path / "escudos" / "foto.jpg").write_bytes(jpeg.getvalue())
    assert _jpeg_size(jpeg.getvalue()) == (40, 80)
    assert build_crests.main(["--root", str(tmp_path)]) == 0
    thumb = Image.open(tmp_path / "escudos" / "s" / "foto.png").convert("RGBA")
    assert thumb.size == (40, 80)
    top, bottom = thumb.getpixel((20, 10)), thumb.getpixel((20, 70))
    assert top[2] > 150 > top[0] and bottom[0] > 150 > bottom[2], (top, bottom)


def test_build_ignores_a_grayscale_icc_profile_instead_of_crashing(tmp_path, capsys):
    # Un perfil de grises: profileToProfile no vale sobre RGBA con él (PyCMSError: cannot build transform).
    # Se ignora (los valores tal cual, como si no lo trajera) y se avisa con el nombre del original.
    Image = pytest.importorskip("PIL.Image")
    (tmp_path / "escudos").mkdir()
    buf = io.BytesIO()
    Image.new("L", (10, 10), 128).save(buf, "PNG", icc_profile=_minimal_icc(b"GRAY"))
    (tmp_path / "escudos" / "gris.png").write_bytes(buf.getvalue())
    assert build_crests.main(["--root", str(tmp_path)]) == 0
    assert "gris.png: perfil ICC GRAY (no RGB), se ignora" in capsys.readouterr().out
    thumb = Image.open(tmp_path / "escudos" / "s" / "gris.png").convert("RGBA")
    assert thumb.getpixel((0, 0)) == (128, 128, 128, 255)


def test_build_ignores_a_cmyk_icc_profile_instead_of_crashing(tmp_path, capsys):
    # Un JPEG CMYK con perfil CMYK: mismo caso que el de grises. Sin perfil, C=0 M=255 Y=255 K=0 da rojo.
    Image = pytest.importorskip("PIL.Image")
    (tmp_path / "escudos").mkdir()
    buf = io.BytesIO()
    Image.new("CMYK", (10, 10), (0, 255, 255, 0)).save(buf, "JPEG", icc_profile=_minimal_icc(b"CMYK"))
    (tmp_path / "escudos" / "cmyk.jpg").write_bytes(buf.getvalue())
    assert build_crests.main(["--root", str(tmp_path)]) == 0
    assert "cmyk.jpg: perfil ICC CMYK (no RGB), se ignora" in capsys.readouterr().out
    r, g, b, a = Image.open(tmp_path / "escudos" / "s" / "cmyk.png").convert("RGBA").getpixel((0, 0))
    assert r > 200 > g and r > 200 > b and a == 255, (r, g, b, a)


def test_build_scales_16_bit_grayscale_before_converting_instead_of_turning_white(tmp_path):
    # Hoy convert("RGBA") sobre I;16 sale blanca sin avisar. Escalado a 8 bits antes, el gris queda su gris.
    Image = pytest.importorskip("PIL.Image")
    (tmp_path / "escudos").mkdir()
    buf = io.BytesIO()
    Image.new("I;16", (10, 10), 40000).save(buf, "PNG")
    (tmp_path / "escudos" / "profundo.png").write_bytes(buf.getvalue())
    assert build_crests.main(["--root", str(tmp_path)]) == 0
    pixel = Image.open(tmp_path / "escudos" / "s" / "profundo.png").convert("RGBA").getpixel((0, 0))
    assert pixel == (156, 156, 156, 255), pixel  # 40000 de 65535 escalado a 8 bits, no blanco


def test_build_skips_a_broken_original_and_keeps_going(tmp_path, capsys):
    # Un fichero que Pillow no abre no para el lote: los demás se escriben y main sale con 1.
    Image = pytest.importorskip("PIL.Image")
    (tmp_path / "escudos").mkdir()
    (tmp_path / "escudos" / "roto.png").write_bytes(b"esto no es una imagen")
    buf = io.BytesIO()
    Image.new("RGB", (20, 20), (10, 20, 30)).save(buf, "PNG")
    (tmp_path / "escudos" / "sano.png").write_bytes(buf.getvalue())
    assert build_crests.main(["--root", str(tmp_path)]) == 1
    out = capsys.readouterr().out
    assert "no se pudo: roto.png" in out
    assert (tmp_path / "escudos" / "s" / "sano.png").is_file()
    assert not (tmp_path / "escudos" / "s" / "roto.png").is_file()
