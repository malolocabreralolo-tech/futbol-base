# Fútbol Base Las Palmas

Portal web de fútbol base de Las Palmas de Gran Canaria. Muestra clasificaciones, resultados, goleadores y detalles de partidos de las categorías Benjamín y Prebenjamín.

🌐 **[Ver portal en vivo](https://malolocabreralolo-tech.github.io/futbol-base)**

## Características

- Clasificación por jornada (Benjamín y Prebenjamín)
- Tabla de goleadores
- Historial de partidos con detalles
- Escudos de todos los equipos
- Funciona como PWA (instalable en móvil)

## Stack

- HTML + JavaScript vanilla + CSS
- GitHub Pages (hosting estático)
- Python (scripts de actualización de datos)

## Estructura

```
index.html                    # Aplicación principal (SPA)
app.js                        # Lógica de la aplicación
style.css                     # Estilos
data-*.js                     # Datos de la temporada (generados por scripts)
escudos/                      # Imágenes de escudos de equipos
scripts/
  fetch_futbolaspalmas.py     # Scraper de futbolaspalmas.es
  fetch_mygol.py              # Scraper de mygol.es
  trim_shields.py             # Optimizador de escudos
  update.sh                   # Script de actualización completa
.github/workflows/
  update.yml                  # Actualización automática de datos
```

## Actualización de datos

Los datos se actualizan automáticamente vía GitHub Actions. Para actualizar manualmente:

```bash
cd scripts
bash update.sh
```

Los scripts de Python hacen scraping de las fuentes de datos y generan los archivos `data-*.js` que la aplicación consume directamente.

## Despliegue

El portal se publica automáticamente en GitHub Pages desde la rama `main`.
