#!/usr/bin/env python3
"""Reconciliación de nombres de equipo entre FIFLP y la base.

FIFLP y futbolaspalmas.com nombran al mismo club de formas muy distintas:

    FIFLP                             base (via Wayback)
    PAN.ERIA PULIDO SAN MATEO, C.D.   San Mateo
    SAN PEDRO ATALAYA, U.D.           Atalaya
    ROQUE AMAGRO DE GALDAR "A" "A"    Roque Amagro A
    TEROR BALOMPIE                    Teror
    SAN NICOLAS                       San Nicolás

Comparar cadenas normalizadas "a pelo" da 30-50% de coincidencia en grupos que
son EL MISMO, que es justo el rango donde un emparejador de grupos se equivoca.
Aquí se compara por TOKENS: el nombre corto suele ser un subconjunto del largo.

La letra de filial NO se colapsa nunca: 'Arucas' y 'Arucas B' son equipos
distintos y confundirlos mezclaría dos grupos.

Este módulo es solo para los importadores de relleno; NO toca las
normalizaciones con contrato (normalize_team_name del reconciliador,
normalize_for_teams_mapping de generate_js).
"""
import re
import unicodedata

# Tipo de entidad y ruido: no distinguen a un club.
_NOISE = {
    'CF', 'CD', 'UD', 'AD', 'SD', 'FC', 'CFS', 'CDF', 'SAD', 'CB', 'EF', 'EDF',
    'CLUB', 'DEPORTIVO', 'DEPORTIVA', 'ATLETICO', 'ATCO', 'ATL', 'REAL',
    'BALOMPIE', 'ESCUELA', 'FUTBOL', 'FUNDACION', 'ASOCIACION', 'SOCIEDAD',
    'DE', 'DEL', 'LA', 'EL', 'LOS', 'LAS', 'Y',
}
_FILIAL = {'A', 'B', 'C', 'D', 'E', 'F'}


def fold(name):
    """Mayúsculas sin acentos ni puntuación. 'Guía' y 'GUIA' colapsan."""
    if not name:
        return ''
    txt = unicodedata.normalize('NFKD', str(name))
    txt = ''.join(c for c in txt if not unicodedata.combining(c))
    txt = txt.upper().replace('Ñ', 'N')
    return re.sub(r'\s+', ' ', re.sub(r'[^A-Z0-9 ]+', ' ', txt)).strip()


# 'C.F.', 'U.D.', 'C.F.S.'… Hay que quitarlas ENTERAS antes de trocear: si no,
# la última letra ('D' de U.D., 'F' de C.F.) se cuela como letra de filial y
# entonces 'SAN PEDRO ATALAYA, U.D.' parece un filial D que no existe.
_ABREVIATURA = re.compile(r'\b(?:[A-Za-zÁÉÍÓÚÑ]\.){2,}')


def team_key(name):
    """(núcleo, filial): tokens distintivos y la letra de filial, si la hay.

    'ROQUE AMAGRO DE GALDAR "A" "A"' -> (frozenset{ROQUE, AMAGRO, GALDAR}, 'A')
    La letra repetida es un artefacto conocido del scraper de FIFLP.
    """
    tokens = [t for t in fold(_ABREVIATURA.sub(' ', str(name or ''))).split() if t]
    filial = ''
    while len(tokens) > 1 and tokens[-1] in _FILIAL:
        # Varias letras seguidas ('B' 'B') son el artefacto del scraper: la
        # misma letra repetida. Manda la última escrita del nombre.
        letra = tokens.pop()
        if not filial:
            filial = letra
    # Las letras sueltas son restos de la abreviatura del club ('U.D.' -> U, D)
    # y nunca distinguen a nadie.
    core = frozenset(t for t in tokens if t not in _NOISE and len(t) > 1)
    if not core:                      # el nombre era todo ruido ('C.D.')
        core = frozenset(tokens)
    return core, filial


# Por debajo de esto no se considera el mismo equipo. 0.6 deja fuera el caso
# peligroso de compartir solo una palabra común: SAN NICOLAS / SAN MATEO = 0.5.
MIN_TEAM_SCORE = 0.6
# Una fuente escribe la letra y la otra no ('ROQUE AMAGRO DE GALDAR "A"' en
# FIFLP es 'Roque Amagro' en la base). Penaliza, pero no descarta: si el rival
# con la letra exacta existe, se lleva el emparejamiento antes por puntuación.
_LONE_FILIAL_PENALTY = 0.85


# Longitud a partir de la cual un token que empieza igual que otro se acepta
# como el mismo: cubre nombres truncados y los pegados del scraper
# ('MASPALOMASB' por 'MASPALOMAS B'). Por debajo daría falsos positivos.
_MIN_PREFIX = 6


def _common(core_a, core_b):
    """Tokens compartidos. Cada token se empareja una sola vez.

    Tres pasadas, de más a menos fiable: igualdad exacta; prefijo largo (cubre
    nombres pegados o truncados por el scraper); y prefijo corto ('Mª' por
    'MARIA'), que solo se admite si el par YA comparte algo — si no, 'San' y
    'Santa' se emparejarían.
    """
    libres, pendientes, n = set(core_b), [], 0
    for ta in sorted(core_a):
        if ta in libres:
            libres.discard(ta)
            n += 1
        else:
            pendientes.append(ta)

    def _por_prefijo(minimo):
        nonlocal n
        for ta in list(pendientes):
            cand = next((tb for tb in sorted(libres)
                         if (ta.startswith(tb) or tb.startswith(ta))
                         and min(len(ta), len(tb)) >= minimo), None)
            if cand:
                libres.discard(cand)
                pendientes.remove(ta)
                n += 1

    _por_prefijo(_MIN_PREFIX)
    if n:
        _por_prefijo(2)
    return n


def team_score(a, b):
    """Parecido entre dos claves de equipo, 0..1. Subconjunto exacto = 1.0."""
    (core_a, fil_a), (core_b, fil_b) = a, b
    if fil_a and fil_b and fil_a != fil_b:
        return 0.0                    # 'Arucas A' y 'Arucas B' NO son el mismo
    if not core_a or not core_b:
        return 0.0
    common = _common(core_a, core_b)
    if not common:
        return 0.0
    # El nombre corto suele ser subconjunto del largo, así que la base es
    # cuánto cubre del más corto. Pero eso solo, con una palabra compartida,
    # funde clubes distintos: 'Atco. Huracán' contra 'MESAS HURACAN, U.D. LAS'
    # daba 1.0 siendo Las Mesas Huracán otro club. Las palabras que quedan sin
    # explicar en el lado largo bajan la nota, sin llegar a descartar
    # ('Atalaya' SÍ es 'SAN PEDRO ATALAYA').
    cobertura = common / max(len(core_a), len(core_b))
    score = (common / min(len(core_a), len(core_b))) * (0.5 + 0.5 * cobertura)
    if bool(fil_a) != bool(fil_b):
        score *= _LONE_FILIAL_PENALTY
    return score


def match_teams(scraped, existing):
    """Empareja nombres scrapeados con nombres de la base, uno a uno.

    Devuelve {nombre_scrapeado: nombre_en_la_base} solo con los que superan el
    umbral, resolviendo por puntuación descendente (el mejor par se lleva el
    equipo, para que un nombre genérico no robe el emparejamiento bueno).
    """
    keys_s = {n: team_key(n) for n in scraped if n}
    keys_e = {n: team_key(n) for n in existing if n}
    pares = []
    for ns, ks in keys_s.items():
        for ne, ke in keys_e.items():
            score = team_score(ks, ke)
            if score >= MIN_TEAM_SCORE:
                # Desempate estable: más núcleo común primero, luego alfabético.
                pares.append((score, _common(ks[0], ke[0]), ns, ne))
    pares.sort(key=lambda p: (-p[0], -p[1], p[2], p[3]))
    out, usados = {}, set()
    for _, _, ns, ne in pares:
        if ns in out or ne in usados:
            continue
        out[ns] = ne
        usados.add(ne)
    return out


def group_overlap(scraped, existing):
    """Cuánto se solapan dos plantillas, 0..1, sobre la más pequeña."""
    if not scraped or not existing:
        return 0.0
    return len(match_teams(scraped, existing)) / min(len(scraped), len(existing))


def canonical_names(scraped, group_teams, season_teams):
    """{nombre scrapeado: nombre que hay que escribir}.

    Primero contra la plantilla del grupo emparejado (lo normal cuando se
    rellena un grupo que ya existe). Lo que quede suelto se busca en el resto de
    equipos de la temporada, porque un club puede existir ya en la base bajo
    otro grupo y no queremos duplicarlo con la grafía de FIFLP: un equipo
    duplicado pierde escudo, histórico entre temporadas y ficha. Lo que no
    aparezca por ningún lado se queda con su nombre limpio de FIFLP.
    """
    # FIFLP escribe el mismo equipo de dos formas dentro del mismo grupo
    # ('INGENIO B, C.D. "B"' en la tabla, 'INGENIO "B", C.D. "B"' en el
    # calendario). Como el emparejamiento es uno-a-uno, sin agrupar las
    # variantes solo una se llevaría el nombre bueno y la otra entraría como un
    # equipo aparte. Las variantes colapsan en la misma clave de equipo.
    grupos = {}
    for n in scraped:
        grupos.setdefault(team_key(n), []).append(n)
    representantes = {sorted(v)[0]: k for k, v in grupos.items()}

    mapa = match_teams(list(representantes), group_teams) if group_teams else {}
    sueltos = [n for n in representantes if n not in mapa]
    if sueltos and season_teams:
        ya_usados = set(mapa.values())
        # El nombre scrapeado puede estar YA en la base tal cual, metido por un
        # import anterior que no reconcilió (la Copa 2023-24 dejó 'TABLERO, C.D.
        # "A"'). Si se deja en el pool, se empareja consigo mismo con la mejor
        # puntuación posible y bloquea el nombre bueno: fuera.
        crudos = set(scraped)
        resto = [t for t in season_teams
                 if t not in ya_usados and t not in crudos]
        mapa.update(match_teams(sueltos, resto))

    out = {}
    for miembros in grupos.values():
        rep = sorted(miembros)[0]
        destino = mapa.get(rep, rep)
        for n in miembros:
            out[n] = destino
    return out
