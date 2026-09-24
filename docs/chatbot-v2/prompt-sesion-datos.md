<!--
  PROMPT PARA LA SESIÓN DE DATOS (continuación de la captura de los 88 productos).
  Uso: abre una sesión NUEVA de Claude Code en este repo y pega como primer mensaje:
      Lee docs/chatbot-v2/prompt-sesion-datos.md (desde "COPIAR DESDE AQUÍ") y ejecútalo.
  O copia todo lo que está debajo de la línea y pégalo tal cual.
  Escrito por la sesión orquestadora el 2026-09-23 a partir de las transcripciones de las dos sesiones anteriores.
-->

===== COPIAR DESDE AQUÍ =====

# Sesión de datos: captura completa y binaria de los 88 productos de Febal Casa

Continúas una sesión de captura que se quedó sin tokens. **Tu único trabajo es extraer y confirmar los datos de cada producto.** Otra sesión se encarga de la arquitectura y la lógica del chatbot; no la toques, no la opines y no escribas documentación de arquitectura. Hay una sesión orquestadora que revisa tu avance a través de los archivos que se piden abajo.

## Reglas de Edd (no negociables)
1. **Resultado binario.** Cada atributo es **SÍ** (confirmado) o **NO** (no confirmado), con su **fuente** (URL de la ficha o ruta de la captura) y su **evidencia literal** (la frase de la página o lo que se ve en la imagen). Nada de "confianza alta/media/baja". Un sinónimo no confirma nada: si la ficha dice "Mustard", el valor confirmado es "Mustard"; que eso sea "amarillo" va en una columna aparte de *familia propuesta*.
2. **Capturas del tour: tú mismo, producto por producto.**
   - Una invocación por producto. Nada de scripts en loop, en lote o en segundo plano (Edd mató uno el 2026-09-23 por eso).
   - **Nunca arrastres el mouse** para encuadrar. Se navega por API con la cámara ya verificada: el mismo mecanismo que el botón "Llévame".
   - Abres tú cada imagen y registras lo que ves.
3. **Fichas oficiales: método híbrido (aprobado por Edd el 2026-09-23).**
   - `scripts/scrape-febal-facts.py` solo descarga el HTML y transcribe **literalmente** las listas de acabados: colecciones, opciones, código y color de la muestra. Un resumen no sirve: WebFetch devolvió Navigli como "ej. Cavaliere: Green, Blue…", cuando la ficha tiene 10 colecciones y 120 opciones.
   - **Tú lees cada ficha completa, una por una**, para todo lo demás (forma, materiales, estilo, medidas, descripción) y confirmas SÍ/NO que las listas del parser coinciden con la página.
   - Lee el texto íntegro, no un resumen. Sácalo del HTML cacheado en `raw-html/`: el navegador sufre el bug de la web que rota a otro producto a los pocos segundos.
4. **El runtime es de solo lectura:** `clients/`, `packages/` y `server/`.
   - Escribes solo en `tour-project/febal-casa/product-facts/` y en scripts nuevos cuyo nombre contenga `facts` o `cdp`.
   - Sin commits ni push.
   - Nunca envías nada a Andrea: Edd le manda el Excel.
5. **Reanudable.** Mantén `product-facts/progreso.json` al día, con el estado de cada paso y de cada producto. Si esta sesión se corta, la siguiente continúa desde ahí sin repetir trabajo.
6. **Ahorra tokens.** No imprimas JSON ni HTML grandes a la consola (usa `head` y resúmenes con conteos). Lee las capturas de una en una.

## Dos niveles de dato (no los mezcles)

| Nivel | Qué es | Fuente |
|---|---|---|
| **Modelo (bajo pedido)** | Lo que se puede pedir: configuraciones o formas, materiales, colecciones y acabados con sus colores, medidas, y el estilo si la ficha lo dice | Ficha oficial en febalcasa.com |
| **Pieza expuesta (showroom)** | Lo que *es* la pieza del tour: color(es), material(es) y acabado visibles, forma; y qué opción oficial es. Esa opción solo se marca SÍ si no hay ambigüedad; si no, NO con una nota | Captura del tour (y la ficha, si lo dijera; en las 57 fichas revisadas, ninguna lo dice) |

**Por qué importa el nivel modelo (regla de Andrea, 2026-09-23).** Cuando un color o acabado no está en el tour pero sí en la ficha, el chatbot dirá "no está en el showroom, pero sí disponible; puedes verlo en su ficha", y mandará al visitante a esa URL. De ahí salen dos consecuencias:
- **La URL de cada modelo tiene que ser exactamente su ficha.** Las 7 URLs rotas pasan a ser un problema visible para el cliente.
- **Cada opción tiene que conservar la URL de la que salió.** Una ficha sin sección de acabados se registra como "sin dato en ficha", nunca como "no disponible".

## Estado heredado (verificado por la orquestadora el 2026-09-23)
- **Universo: 88 piezas activas** (`clients/febal-casa/catalog.json`, `active: true`).
  - Sus cámaras (`media_name`, `yaw`, `pitch`, `fov`) coinciden 88/88 con las verificadas a mano por Edd (`tour-project/febal-casa/matched-catalog.json`, `camera_verified`).
  - Los 13 "fantasma" ya se descartaron y no se tocan.
- **Scraper `scripts/scrape-febal-facts.py`:**
  - Procesó solo 5 de 56 URLs: melrose, navigli, phoenix, profile-leather y vivienne. El resultado está en `product-facts/models.json`, y la caché `raw-html/` tiene 7 páginas.
  - **Bug conocido, arréglalo primero.** Algunas etiquetas pierden la "R" inicial o traen el código pegado, y muchas opciones quedan con `code: null`. Ejemplos:

    | Sale | Probablemente es |
    |---|---|
    | `G050ose` | Rose + código G050 |
    | `A060osewood` | Rosewood + código A060 |
    | `Anthrancite074` | Anthrancite + código R074 (el typo puede ser de la web) |
    | `Eccimeriovere Smoke` | Eccimeri Rovere Smoke |
    | `L002overeSpessartImp` | Rovere Spessart + código L002 |
    | `Oroosa` | Oro Rosa |

    La columna de la derecha es una hipótesis. La verdad es el `alt` y el `span.label` crudos del HTML cacheado, transcritos tal cual.
- **Pasada manual con WebFetch** (la sesión anterior):
  - Datos: `.scratch/webfetch-findings.json` (47 URLs) y `.scratch/webfetch-per-product.json` (65 productos, con SÍ/NO por Forma, Materiales, Acabado, Colores y Estilo, más el detalle). Excel: `~/Downloads/febal-casa-webfetch-atributos.xlsx`.
  - No confirmados, de 65: Forma 4, Materiales 35, Acabado 15, Colores 19, Estilo 12.
  - Los detalles de acabados y colores de esa pasada vienen resumidos ("ej. …"): **no cuentan como lista completa**.
- **23 piezas que WebFetch no cubrió:**
  - FEB-001, 002, 003, 004, 005, 006, 007, 008, 009, 010, 012, 013, 015, 016, 017, 020, 021 y 024 (CASA 01; tienen datos manuales previos en el catálogo, pero **Andrea no los ha validado**);
  - FEB-027 (Camden; son **datos de prueba** y no cuentan);
  - FEB-048 (Melrose; **vacío**);
  - FEB-052 y FEB-091 (Madeira);
  - FEB-094 (Dea).
- **7 URLs rotas o equivocadas.** Busca tú la URL correcta en febalcasa.com; si no la encuentras, pregúntale a Edd. Los arreglos van en `product-facts/url-overrides.json`, con la URL vieja, la nueva, la evidencia y la fecha. **No edites el catálogo.**
  - FEB-037, 058, 059 y 060 (Collezione Momenti): apuntan a una página de lavandería.
  - FEB-099 (Armadio Barret con Portale): apunta a una página genérica de "ispirazioni".
  - FEB-101 (Letto Arden): apunta a la ficha de "Allure".
  - FEB-039 (Letto Couple): no tiene URL.
- **Capturas del tour:**
  - Hay 27 piezas con captura en `.scratch/color-check/` y observación en `.scratch/enrichment-findings.json`. Traen niveles de confianza que tienes que pasar a SÍ/NO.
  - Esas capturas se encuadraron con arrastre, así que se retoman con el método por API:
    - las marcadas "media": FEB-018, 028, 029, 040, 049, 087 y 097;
    - FEB-099, con doble exposición.

    Las demás solo se re-revisan con la imagen existente.
  - **61 piezas no tienen captura.**
  - Las 96 imágenes de `~/Downloads/febal-casa-capturas/` son del 2026-09-13, anteriores a la verificación de cámaras. **No valen como evidencia.**
- **Pregunta pendiente de Edd a la sesión anterior:** *"¿Y estilo? Dame la tabla sobre los 88"*. Es tu primer entregable.

## Herramientas que ya existen (reutiliza, no reinventes)
- **`scripts/cdp_helpers.py`:** `evaluate`, `screenshot`, `find_tab`, `cdp_request`.
  - Usa `127.0.0.1`, no `localhost` (en esta máquina, `localhost` añade ~2 s por llamada).
  - La pestaña del tour está en `localhost:5501`, con CDP en el puerto 9222.
- **`scripts/cdp-batch-capture.py`:** `NAV_JS_TEMPLATE` y `nav_and_set(media, yaw, pitch, fov)`.
  - Replican el "Llévame": escriben `initialPosition`, cambian de panorámica y re-aplican la cámara a los 600/1200/2000/3000 ms. Se espera ~3.4 s entre panorámicas.
  - También traen `ensure_visible()` y `force_foreground()`.
  - **Bug conocido:** si la ventana de Chrome no está en primer plano, el motor no repinta y la captura sale congelada o negra. Si el render se congela, recarga `http://localhost:5501`, elige el idioma IT en la pantalla inicial y sigue.
  - El nombre tiene guion, así que no se importa directamente. Puedes crear `scripts/cdp_nav_one.py FEB-xxx`, que navegue **una sola pieza** por invocación y haga lo siguiente:
    1. leer su cámara del catálogo;
    2. llamar a `ensure_visible` y luego a `nav_and_set`;
    3. comprobar el aterrizaje releyendo la cámara en vivo (±2° en yaw/pitch y ±3 en fov; si falla, reintenta una vez; si vuelve a fallar, lo reporta);
    4. hacer la toma limpia;
    5. guardar la imagen en `product-facts/captures/FEB-xxx.png` y añadir una línea a `captures/manifest.json` (cámara objetivo, cámara real al aterrizar y fecha).

    **Sin `--all`, sin listas y sin loops.**
- **`scripts/cdp-clean-shot.py`:** `HIDE_JS` y `SHOW_JS`, para ocultar la UI del tour en la toma.
- **Si CDP (9222) o el tour (5501) no responden**, pídele a Edd que abra su Chrome con depuración remota y que sirva el tour con `node scripts/serve-demo.mjs febal-casa 5501`.

## Pasos (con checkpoint con Edd al final de cada uno)

### Paso 1. La tabla de los 88 (responde la pregunta pendiente)
- Une `webfetch-per-product.json` (65) con las 23 piezas faltantes, marcadas como "SIN REVISAR".
- Columnas: id, nombre, zona, URL, y SÍ/NO para Forma, Materiales, Acabado, Colores y **Estilo**, más una nota de URL rota.
- Salida:
  - `product-facts/tabla-88.json`;
  - `~/Downloads/febal-casa-atributos-88.xlsx`;
  - una tabla de conteos en el chat.
- Es rápido. No investigues nada nuevo en este paso.

### Paso 2. Listas oficiales completas (el scraper)
1. Arregla el bug de etiquetas y códigos. Valídalo con los 5 modelos ya procesados: cero etiquetas mutiladas.
2. Resuelve las 7 URLs en `url-overrides.json` y haz que el scraper las use.
3. Corre el scraper sobre **todas** las URLs.
4. Verifica:
   - totales por modelo;
   - `integrity` (el canonical y el título coinciden con el slug);
   - que no queden swatches sin color;
   - 5 modelos cotejados a mano contra el texto completo de la página: Melrose, Balmoral, Profile Leather, Madeira y Boiserie.
5. **Reporta:** modelos con acabados, modelos sin sección de acabados, número de opciones y hallazgos. Por ejemplo, qué sofás se pueden pedir en tonos amarillo o mostaza y si alguno ofrece piel.

### Paso 3. Lectura manual de cada ficha (nivel modelo)
- Una ficha por vez, con el texto completo. Para cada modelo, SÍ/NO con evidencia literal de:
  - forma o configuraciones;
  - materiales (estructura, tapizado, tapa…);
  - que las listas del parser coinciden con la página;
  - colores;
  - estilo, **solo si la página lo dice**;
  - medidas.
- Aquí se resuelven los NO de la pasada WebFetch cuando la ficha sí trae el dato.
- Salida: `product-facts/model-attributes.json`.
- Reporta cada ~15 modelos.

### Paso 4. Capturas y observación (nivel pieza)
1. Primero, copia las 27 capturas existentes a `product-facts/captures/`.
2. Retoma las 8 marcadas arriba.
3. Captura las 61 que faltan: **una por una**, con tu helper de una sola pieza, y abriendo tú cada imagen.
4. Para cada pieza registra, en SÍ/NO con evidencia y **por componente**:
   - el rol del componente: tapizado, estructura, patas, puertas, frente, tapa, base, cojines, interior…;
   - cuál componente es el **dominante**, es decir, la superficie que define "de qué color es" la pieza;
   - color(es) visibles, con nombre literal y familia propuesta aparte;
   - material y acabado aparentes;
   - forma;
   - la opción oficial que corresponde, contrastada con el `swatch_hex` de `models.json`: SÍ solo si es inequívoca.
5. **Casos especiales:**
   - **FEB-050 / FEB-046:** misma sala. Distingue si son piezas distintas.
   - **FEB-034 (Phoenix):** la mesa queda detrás de una puerta. Si la cámara verificada no la muestra, se registra NO con una nota para Edd. **No la re-encuadres tú.**
6. Salidas:
   - `product-facts/placements.json`, con una entrada por `product_id` (88);
   - `captures/manifest.json`.
7. Reporta cada ~15 piezas.

### Paso 5. Normalizaciones (todas marcadas como `"status": "propuesta"`)
- **`line-materials.json`:** colección → material.
  - Fuente `page_header` cuando el encabezado lo dice (LACCATO OPACO, SIMILPELLE INCA, GRES, VETRI…).
  - Si no, `to_confirm`. Ahí entran Boston, Campsbay, Rimini, Jolie…
  - Y la pregunta de si **Nabuk Eagle** es piel o microfibra.
- **`color-names.json`:** etiqueta oficial → familia propuesta, por nombre (EN/IT) y por `swatch_hex`. Si los dos no coinciden, se marca.
- **`style-proposals.json`:** un estilo propuesto por modelo **solo cuando la ficha no lo dice** (minimal, contemporáneo, clásico elegante, cálido…), con la razón visible en la captura o en la descripción. Va marcado `curado · propuesta` y separado de lo que dice la ficha. Andrea responde SÍ o NO en su Excel.

### Paso 6. Excel de revisión para Andrea + cobertura
- **`scripts/export-facts-review.mjs`** genera `product-facts/febal-casa-revision-datos.xlsx` y lo copia a `~/Downloads`.
  - En español, con los valores en italiano.
  - Hojas: Instrucciones · Piezas showroom (88) · Modelos · Líneas y materiales · Colores → familia · Preguntas abiertas.
  - Cada fila lleva el SÍ/NO, la evidencia y la ruta de la captura, más las columnas que llena Andrea: **¿OK? / Corrección / Nota**.
  - En Preguntas abiertas van, como mínimo: Nabuk Eagle, Letto Couple, las fichas sin acabados (Rio, Andy…), FEB-026/027 y si Profile Leather es solo similpelle.
  - También las preguntas de producto de la sección 8 de `docs/chatbot-v2/03-decision-refactor.md` (P1, P3–P9): ¿chaise longue o penisola cuentan como "de ángulo"?, ¿firma ella las armonías?, acabados descatalogados, máximo de tarjetas, idiomas no soportados, preferencias persistentes, canal de contacto, y si mostrar siempre algo físico.
  - Agrega una hoja **Estilos propuestos** con `style-proposals.json`.
- **`scripts/import-facts-review.mjs`** relee las columnas de Andrea y genera `*.reviewed.json`, la única verdad para la sesión 3. Pruébalo con una copia del Excel con 2–3 correcciones ficticias y luego borra esa copia.
- **`product-facts/coverage.json`**, con las cifras finales:
  - modelos: ok / sin acabados / integridad fallida / opciones totales;
  - piezas: con captura, con opción oficial confirmada y con motivo de NO;
  - número de preguntas abiertas.

  La orquestadora redacta con eso `docs/chatbot-v2/datos-captura-estado.md`.
- **Aserción final:** `git diff --quiet -- clients packages server` debe pasar (cero cambios del runtime).

## Cómo reportar
- En el chat, cortito: una tabla de conteos y los hallazgos que Edd deba decidir. Nada de ensayos.
- Mantén `product-facts/progreso.json`, con la forma `{paso_actual, pasos: {...}, piezas: {FEB-xxx: {captura, observada, modelo_leido}}, bloqueos: []}`. La orquestadora lo lee para seguir tu avance.
