# Handoff — Asistente Febal Casa (3dvista-assistant)

> Pega esto completo como prompt inicial de una nueva sesión de Claude Code lanzada dentro de este repo (`3dvista-assistant`).

## Qué es esto

Asistente de IA embebido en el tour virtual 3DVista del showroom de **Febal Casa**, mueblería italiana de diseño (marca de Colombini Group). Ayuda al visitante a encontrar muebles y lo guía por la cámara del tour hasta ellos. Cliente real: **Andrea** (Interiors3D), quien a su vez sub-contrata/coordina este desarrollo con Edd.

## Contexto real de Andrea (de sus audios de WhatsApp y capturas, 2026-09-03)

- Andrea terminó una llamada con un cliente suyo (un amigo que además le refiere más clientes) que probó el asistente en vivo. El cliente detectó que todavía "no es madura, es verde": preguntó por un sofá de esquina y el asistente respondió que no tenía nada.
- Plazo real: **10-15 días**, porque después de eso empieza la temporada en la que Andrea sale a buscar clientes nuevos — necesita el asistente perfecto antes de esa fecha.
- Andrea se ofreció explícitamente a **ayudar a preparar/enriquecer la base de datos** del catálogo (estilos, filtros, detalles) — cualquier trabajo de enriquecimiento de datos debe coordinarse con ella, no inventarse.
- De sus capturas de pantalla del asistente en vivo, reportó 3 problemas concretos (ver detalle abajo).
- Aparte, en otro audio, preguntó si sería posible una versión **offline** del sistema de tours en general (para clientes en ferias/exhibiciones con mal internet) — **no urgente**, y ella misma aclaró que **no aplica a este proyecto específico** (es una idea para el otro producto, el configurador general de tours).

## Llamada con Andrea (2026-09-07) — nuevos pedidos, en orden de prioridad

1. **Trazabilidad de "mesa redonda"** — Andrea probó en vivo GPT-4o-mini y Sonnet: al pedir "mesa redonda", GPT-4o-mini dijo que no había tavoli rotondi; Sonnet sí encontró uno real (Tavolo Madeira) con detalle correcto. Pidió explicación completa de por qué. **Ya investigado y corregido, ver sección propia más abajo.**
2. **Vista frontal al llegar a un producto** — sigue siendo el pendiente #1 de "Qué falta" (Divano Navigli de espaldas). Andrea confirmó que esto se resuelve en la misma sesión de captura producto-por-producto del punto 3 (no es un fix aislado).
3. **Base de datos completa + trazabilidad de cruces de datos (con diagramas)** — el trabajo grande. Mecánica acordada con Andrea/Edd: ella (o quien navegue) se mueve por el tour real ajustando yaw/pitch/fov hasta que la cámara quede en la vista correcta de un producto; en ese momento avisa, y Claude captura ese estado exacto (yaw/pitch/fov/media_name vigentes, vía CDP en el navegador) y lo escribe en el Excel — así se corrige a la vez el bug de "vista frontal" (la cámara guardada para navegar ahí) para los 95 productos. Después de esa pasada, Claude llena las columnas de dato (`colors`/`materials`/`shape`/`finish`) del resto del catálogo (71 productos fuera de CASA 01) con el mismo método de CASA 01 (scraping de febalcasa.com + lo observado en el tour), y entrega una explicación completa con diagramas de cómo cruzan los datos entre catálogo → filtros → herramientas → prompt, para que el equipo pueda encontrarle más bugs como el de la mesa redonda a los 3 modelos.
4. **Botón "Ver en el espacio" (AR)** — icono nada más, sin funcionalidad todavía, en las tarjetas de producto para ciertas categorías (sillones/poltrone, sillas/sedie, mesas/tavoli). Anotado como backlog, no construido esta sesión.
5. **Ícono de micrófono (STT)** — a la izquierda de la caja de texto del chat, con funcionalidad real de voz-a-texto. Anotado como backlog, no construido esta sesión.

## Trazabilidad completa: por qué "mesa redonda" falló en GPT-4o-mini pero no en Sonnet

**Conclusión corta: ningún modelo alucinó — ambos razonaron correctamente sobre los datos que tenían. El bug era un JOIN roto en el pipeline de datos, ya corregido.**

- El catálogo tiene **dos filas distintas llamadas "Tavolo Madeira"**: `FEB-052` (CASA 03, cerca de donde Andrea probó) y `FEB-091` (GALLERIA) — mismo producto real de Febal (mismo `detail_url`), colocado en dos hotspots del tour.
- En el Excel/JSON fuente (`tour-project/febal-casa/matched-catalog.json`), la fila de `FEB-052` tenía un **espacio en blanco al final de la URL** (`.../madeira/ ` en vez de `.../madeira/`). El script de scraping guardó la descripción real bajo la URL limpia — así que la búsqueda por URL exacta de `FEB-052` no encontró nada, y ese producto se quedó con la descripción genérica de respaldo (sin ninguna mención de forma). `FEB-091`, con la URL bien escrita, sí trajo la descripción real completa: *"Il piano è di forma rotonda, ovale fisso o allungabile..."*.
- **GPT-4o-mini** vio la versión sin datos (`FEB-052`, la más cercana a donde Andrea preguntó) y, honestamente, no encontró nada que dijera "rotondo" — concluyó que no había mesas redondas. No alucinó; simplemente le tocó la copia rota.
- **Sonnet** encontró `FEB-091` (con los datos reales) en el catálogo completo de respaldo y respondió correctamente citando su descripción real — no la inventó, la leyó tal cual estaba.
- **Arreglado**: se corrigió el espacio en la fuente, se hizo que `build-febal-catalog.mjs` recorte (`.trim()`) los links antes de buscarlos en el caché de scraping (para que este tipo de espacio nunca vuelva a romper un cruce en silencio), y se le puso `shape: "rotondo o ovale, fisso o allungabile"` a ambos `FEB-052`/`FEB-091` ahora que se confirmó el dato real. **Verificado en vivo**: la misma pregunta "Mesa redonda" contra GPT-4o-mini ahora sí propone el Tavolo Madeira correcto con tarjeta.
- Sin commitear todavía junto con el resto de esta sesión.

## Qué ya se hizo (verificado con commits reales, no solo planeado)

1. **Auto-scroll + visibilidad de resultados nuevos** — commit `bd2dc64`. Antes, la lista de mensajes siempre restauraba la posición exacta de scroll, incluso cuando llegaba una respuesta nueva con tarjetas de producto — el visitante tenía que notar y hacer scroll manual. Ahora: los re-renders que NO agregan mensaje nuevo (ej. un corazón de wishlist marcado en otro lado) siguen preservando la posición como antes, pero un mensaje genuinamente nuevo hace scroll suave para revelarlo. Archivo: `packages/assistant-ui/src/message-list.ts`.
2. **Texto en español colándose — causa raíz encontrada y corregida** — commit `2a48d50`. La causa NO era una instrucción de idioma faltante (el prompt de sistema ya fuerza italiano de forma explícita y repetida). La causa real: `scripts/build-febal-catalog.mjs` guardaba la categoría de cada producto (`product.category`) directamente en español ("sofás", "sillones", "mesas", etc.) — ese valor interno de matching se filtraba como si fuera dato de cara al cliente. Se relabearon las 95 categorías a italiano (divani, poltrone, tavoli, ...), conservando toda la cobertura multilingüe de búsqueda (para que "sofa"/"sillón" en español sigan encontrando resultados) en un diccionario de sinónimos aparte, ya no mezclado con el valor mostrado. Catálogo regenerado y verificado (95 registros, mismas coordenadas e imágenes, solo cambiaron las categorías).

Ambos commits pasaron `tsc --noEmit` limpio y el build completo del monorepo (`npm run build:core`) sin errores, más regeneración exitosa del bundle de producción (`node scripts/build-tour-bundle.mjs febal-casa`).

## Qué falta — con diagnóstico ya hecho, no arrancar de cero

1. **Vista frontal al navegar a un producto** (bug confirmado: el Sofá/Divano Navigli, al llegar con "Llévame", se ve desde atrás). Diagnóstico ya hecho: la lógica de navegación de cámara (`packages/tour-bridge/src/player-api-navigator.ts`) es correcta — el problema es que el yaw/pitch/fov guardado por producto no está bien ajustado. **Plan acordado con Andrea (ver "Llamada con Andrea" arriba): se corrige junto con el enriquecimiento completo, en una sesión de captura producto-por-producto en vivo** (ella mueve la cámara, Claude captura el estado con CDP) — no arrancar esto sin coordinar esa sesión primero.
2. **Previews de imagen faltantes en listados de texto** — sigue sin investigarse a fondo. Revisar el flujo de `get_product`/`get_alternatives` en `server/src/agent/tools.ts` y cómo `packages/assistant-ui/src/product-card.ts` decide si renderiza la tarjeta con imagen.
3. **Enriquecimiento del catálogo — arquitectura lista, datos parciales**: `shape`/`colors`/`materials`/`finish` ya no están vacíos por diseño (ver sección de abajo) — pero de 95 productos, solo los 24 de **CASA 01 - AUTENTICA** tienen datos reales investigados (22 completos, 2 en blanco a propósito por no poder identificarlos con confianza: `FEB-018`, `FEB-023`). **CASA 02/03/04 y GALLERIA (71 productos) siguen vacíos.** El método que funcionó: capturas de la panorámica real del tour (para color) + scraping de la página de producto real en febalcasa.com (para forma/material/acabado) — ver "Cómo enriquecer el catálogo" abajo antes de repetirlo.
4. **`FEB-026`/`FEB-027` (Divano Camden) son datos de PRUEBA, no investigados** — se sembraron a mano (Velvet/verde y Boston/cognac) solo para probar la arquitectura de variantes de color/acabado, nunca se verificaron contra la ficha real de Camden en febalcasa.com ni contra la foto del tour. No tratarlos como dato confiable — o se re-investigan igual que CASA 01, o se le pregunta a Andrea directamente.
5. **`COLOR_FAMILIES`** (`packages/catalog-engine/src/color-families.ts`) es una tabla semilla inventada antes de tener colores reales de Andrea — revisar si sus agrupaciones (p. ej. café/marrón/cognac juntos) tienen sentido con el vocabulario real de Febal una vez que haya más datos.
6. **No existe un equivalente de `COLOR_FAMILIES` para `shape`** — hoy si alguien pide "un sofá ad angolo" y solo hay Camden en "modulare con isola"/"modulare curvo" (ninguno literalmente "ad angolo"), el sistema no lo ofrece como alternativa cercana (a diferencia del color, que sí tiene ese fallback honesto). Ver el comentario en `packages/catalog-engine/src/schema.ts` junto al campo `shape` para el diseño exacto si se decide construirlo.

## Arquitectura de color/forma/acabado (nueva esta sesión, sin commitear)

Todo lo de esta sección y las 3 siguientes (arquitectura, migración de ids, enriquecimiento de CASA 01, auditoría de idioma) está en el working tree, **no en un commit todavía** — `git status` tiene un diff grande. Revisar antes de decidir cómo trocear los commits.

Se construyó para resolver un pedido real de Andrea (audio de WhatsApp, 2026-09-05): que el chatbot maneje variantes de un mismo mueble por color/acabado, y ofrezca alternativas honestas cuando el color exacto no existe.

- **`finish`** (nuevo campo, array): línea de acabado con nombre propio de Febal (p. ej. "Velvet", "Boston" — confirmado en vivo en febalcasa.com, sección "Rivestimenti"/"Finiture" de cada producto). Distinto de `materials` (composición física) y `colors` (el tono).
- **`get_product_variant(product_id, requested_value)`** (tool nueva, determinista): resuelve "¿lo tienes en verde?" sobre un producto ya propuesto, buscando entre "hermanos" de mismo `name` exacto (no `alternatives_group`, que sigue siendo sustitutos de categoría).
- **`color_fallback`** en `search_catalog`: si el color pedido no existe, reintenta sin ese filtro y sugiere el color real más cercano (solo si comparte familia en `COLOR_FAMILIES`, nunca inventa cercanía).
- **Bug real corregido de paso**: `distinctAlternatives()` en `server/src/agent/tools.ts` colapsaba por nombre sin mirar atributos — dos "Divano Camden" con distinto acabado ahora se muestran como opciones distintas, no una.
- Todo esto vive en `tools.ts`/`catalog-engine`, compartido automáticamente por los 3 backends (OpenAI, Anthropic-raw, Claude Agent SDK) — no hay que tocar nada por separado.

## Ranking de alternativas por atributo (implementado 2026-09-10, sin commitear)

Bug real reportado por el usuario con capturas: al pedir alternativas de una mesa redonda (Tavolo Madeira), `get_alternatives` mostraba mesas cuadradas primero y enterraba la otra Madeira redonda real más abajo — porque `distinctAlternatives` solo dedupe/filtra, nunca ordenó por parecido. Pushback validado del usuario: el ATRIBUTO que el visitante pidió sí debería importar para el orden — si pregunta por color, una alternativa del mismo color pero otra forma debería ganarle a una de la misma forma pero otro color.

- **`packages/catalog-engine/src/similarity.ts`** (nuevo): `similarityScore(anchor, candidate, preferred?)`/`rankBySimilarity(anchor, candidates, preferred?)` — puntúa cuántos atributos reales (`shape`/`color`/`style`/`finish`) comparte cada candidato con el ancla, usando los mismos matchers que ya usan los filtros (`fieldMatches`/`shapeMatches`, nunca inventa cercanía). Es un **reordenamiento puro**: nunca filtra, y cuando ningún candidato tiene datos de atributos (el caso más común hoy, catálogo apenas parcialmente enriquecido) es un no-op exacto (mismo orden que antes). `preferred` pesa 10x más que el resto — domina el orden sin excluir lo demás.
- **`get_alternatives`** ahora acepta `preferred_attribute` opcional (`"shape"|"color"|"style"|"finish"`) en los 3 lugares de siempre (`tool-schemas.ts`, `claude-code-tools.ts`, y el switch de `server/src/agent/tools.ts`) — el modelo lo pasa solo cuando el visitante especificó explícitamente por qué característica pide alternativas (regla 15 nueva en `prompt.md`). Sin ese hint, sigue rankeando por parecido total (sin preferencia), que ya por sí solo resuelve el bug reportado (la Madeira redonda gana a las cuadradas por compartir `shape`).
- Afecta también a la **ruta HTTP determinista `/alternatives`** (`server/src/routes/alternatives.ts`, sin LLM, solo `product_id`): se beneficia automáticamente del ranking-sin-preferencia (no puede pasar `preferred_attribute` porque no tiene contexto de conversación, pero el orden por parecido total ya mejora sobre el orden crudo de antes).
- Catálogo reconstruido después del fix (`node scripts/build-febal-catalog.mjs`, preserva enriquecimiento vía `previousByNaturalKey`) + `validate-catalog.mjs` + `npm run build:core` — todo limpio.
- **Pruebas reales en vivo (3 backends)**: ver `server/live-test-alternatives.mjs` / `server/live-test-alternatives-results.json` (no comiteados, reproducibles). Hallazgo del propio test, no un bug: varios nombres de producto (Tavolo Madeira, Libreria Lapis) tienen 2 hotspots reales en secciones distintas, así que un mensaje ambiguo ("muéstrame el Tavolo Madeira") hace que el modelo pida aclarar la sección antes de proponer — comportamiento correcto (regla 11: nunca describir sin `get_product` primero), pero hay que dar la sección o responder la aclaración para que el test llegue a ejercitar `get_alternatives`.

## Chatbot multi-idioma (implementado 2026-09-10, sin commitear)

Andrea pidió (vía Edd) que el chatbot sea multi-idioma: si el visitante escribe en español (o cualquier otro idioma), el modelo debería responder en ese idioma en vez de forzar italiano siempre — y que esto también aplique a "las funciones de búsqueda y cruce de datos". Se planeó primero (ver diseño abajo, todavía válido) y se implementó y probó en vivo el mismo día.

**Dos ejes independientes, no confundirlos:**

1. **Idioma de la RESPUESTA** (la prosa que lee el visitante) — hoy forzado a italiano siempre por las reglas 3 y 10 de `prompt.md`, sin excepción.
2. **Idioma de los ARGUMENTOS de herramienta** (`query`, `color`, `material`, `shape`, `style`, `finish`, `requested_value`) — hoy implícitamente italiano porque así está el catálogo, pero sin ninguna regla que lo diga explícitamente ni ningún mecanismo que lo garantice.

**Eje 1 — cómo resolverlo (barato, sin código nuevo, solo `prompt.md`)**: no hace falta un paso de "detección de idioma" separado (ni librería, ni heurística) — el modelo ya "lee" en qué idioma está escrito el último mensaje del visitante cada vez que genera una respuesta, así que basta una regla: *responde siempre en el mismo idioma del ÚLTIMO mensaje del visitante; si es ambiguo, es el primer turno, o el mensaje no tiene contenido lingüístico (p. ej. solo un nombre propio), usa italiano por defecto*. Reemplazaría las reglas 3/10 actuales.
   - **Caso especial sin solución de prompt**: `tour.config.json`'s `welcomeMessage` (`clients/febal-casa/entry.ts` → `packages/assistant-ui/src/chat-card.ts`) es un string **estático en italiano**, mostrado ANTES de que el visitante escriba nada — no hay mensaje del visitante del que "leer" el idioma todavía. Opciones a decidir con Andrea cuando se implemente: (a) dejarlo siempre en italiano (razonable para un showroom italiano — el bot cambia de idioma desde la respuesta del turno 1 en adelante), (b) detectar `navigator.language` del navegador client-side y elegir entre un set pequeño pre-traducido, (c) un selector de idioma visible. No es un bloqueador, solo una decisión pendiente.

**Eje 2 — el punto realmente delicado**: `fieldMatches`/`shapeMatches` (`packages/catalog-engine/src/matching.ts`) comparan el valor del filtro contra el valor REAL guardado en italiano (`colors`/`materials`/`finish`/`shape`/`style`/`category`) — no existe ninguna capa de traducción para filtros estructurados. Lo único multilingüe hoy es `keywords`/`synonyms`, y solo alimenta el scoring del `query` de texto libre (`search.ts`'s `scoreProduct`, vía el haystack de palabras clave) — nunca los filtros estructurados. Si el modelo pasara `color: "brown"` o `color: "café"` tal cual, jamás matchearía "marrone"/"cognac" reales.
   - **Diseño recomendado (opción A, la de menor esfuerzo y la que ya pidió Andrea implícitamente — "que el modelo haga la traducción")**: instruir al modelo (regla nueva en `prompt.md`) para que SIEMPRE llame las herramientas de búsqueda (`query` libre incluido, no solo los filtros estructurados) usando los términos reales en italiano que él mismo ya conoce del catálogo — traduciendo mentalmente lo que el visitante describió — sin importar en qué idioma le haya hablado el visitante. Esto es una instrucción de prompt, cero código nuevo en `catalog-engine`. Importante: esto también mejora el `query` libre en sí, no solo los filtros — `scoreProduct` da mucho más peso (+10/+9/+6) a coincidencias literales contra `name`/`shape`/`style` en italiano que al haystack de sinónimos (+3), así que un query ya traducido a italiano busca mejor que uno dejado en español.
   - **Por qué es seguro aunque la traducción del modelo falle**: las reglas de honestidad ya existentes (11, 12, 13, 14) ya obligan a decir primero "no tengo eso" y luego nombrar los valores reales antes de proponer nada — una traducción imperfecta del modelo degrada exactamente a esa misma vía honesta (cero resultados → `low_confidence`/`full_catalog` o `color_fallback`), nunca a un producto inventado. Ese colchón hoy es más fuerte para `color` (`color_fallback` ofrece el más cercano) que para `material`/`finish`/`shape`/`style` (esos solo caen al catálogo completo de respaldo, sin sugerencia de "más cercano" — mismo gap ya anotado en "Qué falta" sobre `SHAPE_FAMILIES`).
   - **Nueva regla necesaria y su matiz más importante**: dejar clarísimo en `prompt.md` que los dos ejes son independientes — el idioma de la PROSA cambia según el visitante, pero los ARGUMENTOS de herramienta siempre van en italiano real, y al NARRAR un valor real (p. ej. el color más cercano) se traduce la palabra al idioma del visitante para la prosa ("el más cercano es cognac" en español está bien) pero sin inventar un valor que no sea el real ("marrón" en vez de "cognac" NO, porque marrón no es el string real guardado).
   - **Opción B (extensión futura, no para la primera versión)**: si en pruebas reales la traducción del modelo no es confiable para algún campo específico, extender el patrón de `COLOR_FAMILIES` con alias por idioma (mismo mecanismo, ahora indexado por idioma en vez de por familia de cercanía) — campo por campo, dirigido por fallos reales observados, no adivinando de entrada todos los idiomas/términos posibles. Esto si tiene costo real de datos (mantenimiento de tablas de alias por idioma) y no se recomienda como punto de partida.

**Qué NO cambió (fase 1, opción A, tal como se planeó)**: el catálogo sigue en italiano sin excepción, `search.ts`/`matching.ts` no se tocaron, no hay columna ni campo nuevo. El único archivo modificado fue `clients/febal-casa/prompt.md`: regla 3 (persona) y regla 10 reescritas de "SIEMPRE italiano" a "en el idioma del último mensaje del visitante, italiano por defecto si es ambiguo/primer turno"; regla 10b nueva (argumentos de herramienta SIEMPRE en italiano real, eje independiente del idioma de respuesta, el modelo traduce él mismo); referencia suelta a "italiano" en la regla 12 corregida para no contradecir la nueva 10. Los botones de la UI ("Llévame"/"Ver alternativas", en `packages/assistant-ui`) siguen fijos en italiano — son chrome estático, no texto generado por el modelo; y `tour.config.json`'s `welcomeMessage` sigue en italiano (opción (a) del plan, sin bloquear nada).

**Resultado de pruebas reales (`server/live-test-multilang.mjs`, `server/live-test-multilang-switch-retry.mjs`, no commiteados)**, contra los 3 backends:

- **Arranque en español**: 3/3 modelos responden en español correctamente.
- **Arranque en inglés**: Sonnet 5 y Haiku 4.5 responden en inglés fluido, con tarjeta real y datos correctos (ver ejemplo Tavolo Madeira). **gpt-4o-mini se queda en español** en vez de inglés — no sigue la regla del idioma del visitante para inglés, aunque sí la sigue para español.
- **Filtro estructurado traducido** ("I want something elegant in brown color", en inglés): **3/3 modelos tradujeron correctamente y dispararon el fallback honesto real** (nunca inventaron "brown"/"marrón" como si existiera; los 3 ofrecieron el cognac real como opción cercana, con tarjeta correcta FEB-027 cuando aplicaba). Éxito completo en el eje que el plan marcaba como el más delicado.
- **Cambio de idioma a mitad de conversación (ES→EN)** — el caso más difícil: **solo Haiku 4.5 lo maneja bien** (cambia a inglés en el turno donde el visitante cambia). gpt-4o-mini y Sonnet 5 se quedan pegados al idioma con el que arrancó la conversación, incluso después de reforzar la regla 10 con un ejemplo explícito idéntico a este caso (se probó, se repitió la prueba, mismo resultado en ambos). **Esto se documenta como límite conocido, no se siguió iterando el prompt** — parece ser una limitación real de esos 2 modelos para priorizar el último mensaje sobre la inercia del idioma ya usado en la conversación, no algo que más texto de instrucción resuelva. Si esto importa para la demo, la siguiente palanca sería de código (p. ej. detectar el idioma del último mensaje con una heurística simple y pasarlo como un hecho explícito en el system prompt, en vez de confiar en que el modelo lo infiera solo) — no implementado, requiere decidirlo antes de tocar código nuevo.

## `product_id` — migrado a códigos cortos

Ya no son slugs largos (`box-100-b-106-divano-balmoral`) — son `FEB-001`...`FEB-095`, a pedido de Andrea. El script (`scripts/build-febal-catalog.mjs`) los reasigna de forma **estable entre corridas** (reusa el mismo código si la fila ya existía, vía una "llave natural" interna) y remapea `compatible_with` automáticamente. Si algún script/nota vieja menciona ids largos tipo `box-...`, están obsoletos.

## Cómo enriquecer el catálogo (método que funcionó, CASA 01)

1. Servir el tour real localmente: `python -m http.server <puerto>` sobre `deploy-febal-casa/` (o el `tour-export` de `tour-project/febal-casa/`), navegar por Chrome real, usar `window.tour.player.getById("rootPlayer").setMainMediaByName("<media_name>")` en consola para saltar a cada panel, y **arrastrar el mouse para rotar la vista** (forzar yaw/pitch por API no siempre refresca el render — ver gotcha abajo). Así se identifica el color real de cada pieza.
2. Para forma/material/acabado: abrir la página real del producto en febalcasa.com (`detail_url` del catálogo), buscar la pestaña "Modularità"/"Rivestimenti"/"Finiture" (a veces hay que hacer clic para que cargue el contenido). **Cuidado**: la web de Febal tiene un bug real donde la página rota sola a otro producto random unos segundos después de cargar — hay que capturar los datos en el mismo round-trip de la navegación, no confiar en una lectura demorada. Vale la pena avisarle a Andrea de este bug de su propia web.
3. Varios `product_id` distintos suelen compartir el mismo `detail_url` (mismo modelo base, distintas ubicaciones/colores en el showroom) — no hay que visitar la página una vez por producto, solo una vez por URL única.

## Auditoría de idioma (español colándose en italiano) — hacerlo A MANO

Se encontró esta misma clase de bug **tres veces** en este proyecto (categoría en `2a48d50`, luego `style` y la plantilla de descripción de respaldo en esta sesión) — siempre en scripts que hardcodean un label. Se intentó automatizar la detección con un script de patrones (`check-italian.mjs`) pero **se eliminó a pedido explícito** después de que una revisión manual encontrara "modular" (falta la "e", no es italiano) donde el script no vio nada raro (no tiene tilde ni es una palabra española conocida). **Lección: para este tipo de auditoría, leer los valores distintos de cada campo en persona vale más que un regex.** Campos ya auditados y limpios: `name`, `category`, `description` (las 59 versiones únicas), `colors`, `materials`, `finish`, `shape`, `style`, `alternatives_group`, `section`. `keywords`/`synonyms` mezclan idiomas **a propósito** (índice de búsqueda interno, nunca llega al modelo) — no tocar eso pensando que es un bug.

## Gotchas operativos (para no perder tiempo re-descubriéndolos)

- **`server/.env`'s `ALLOWED_ORIGIN` es un match exacto, uno solo.** Si vas a correr los 3 backends (8961/8962/8963) sirviendo cada uno su propio demo en un puerto distinto (5501/5502/5503), cada backend necesita su propio `ALLOWED_ORIGIN` apuntando al puerto del demo que lo consume — si no, CORS los rechaza en silencio desde el navegador (aunque `curl` directo al backend responda perfecto, que es la primera señal de que el problema es de origen, no del modelo).
- **`tour-project/febal-casa/tour-export/index.htm` tiene la URL del widget grabada en duro** (inyectada por `inject-widget.mjs`), apuntando a un solo puerto. Ya existen `index-sonnet.htm`/`index-haiku.htm` con sus propias URLs correctas — al usar `scripts/serve-demo.mjs`, pasar el 5to argumento (`INDEX_FILE`) para cada variante, o los 3 "backends" terminan cargando en secreto el mismo bundle.
- **`MODEL_PROVIDER=claude-code`** (Claude Agent SDK, usa el login local de la CLI de Claude Code, sin API key ni billing por token) es la forma de probar Sonnet/Haiku en local. IDs usados: `claude-sonnet-5`, `claude-haiku-4-5-20251001`.
- **`catalog.xlsx` no se puede regenerar mientras está abierto en Excel** (Windows lo bloquea, `build-febal-catalog.mjs` truena con `EBUSY`) — cerrar el archivo antes de correr el script. El `.gitignore` ya excluye el archivo de bloqueo temporal que Excel crea (`~$catalog.xlsx`) — antes no lo hacía.
- **El tour de 3DVista es flaky para clics automatizados por coordenadas fijas**: el viewport cambia ligeramente entre capturas, así que un clic en `(x,y)` fijo a veces no aterriza en el botón de idioma. Usar `find()` + clic por `ref`, no coordenadas. Además, un error repetido en consola (`Cannot read properties of undefined (reading 'instance')` en `tdvplayer.js`) es **ruido inofensivo** que aparece igual en los 3 backends mientras el jugador 3D no ha terminado de inicializar — no es un bug de ningún modelo/backend en particular.
- **Reporte de pruebas UX** (8 turnos × 3 modelos, transcripción completa, español/italiano): `https://claude.ai/code/artifact/24ea3087-c815-4cdd-bd99-cc45e897dd6c`. Resumen: los 3 nunca inventaron un color/forma/acabado; GPT-4o-mini es el más rápido y estable (3.4s promedio); Sonnet el más preciso pero lento (20.4s promedio, hasta 33.7s); Haiku tuvo 2 fallas HTTP 502 reales en 8 turnos — vale la pena repetir esa prueba antes de confiar en Haiku para la demo.

## Sesión de captura manual de POV (2026-09-21/22) — panel `cdp-capture-panel.py`

Continuación directa del plan de "captura producto-por-producto" ya anotado arriba
(sección "Llamada con Andrea", punto 3). Se abandonó el intento inicial de que Claude
manejara el mouse (drag real vía CDP demostró tener inercia/velocidad impredecible y,
peor, puede saltar de panorama sin avisar si el drag cruza uno de los aros de
navegación del piso) — Edd pidió explícitamente cero automatización del movimiento de
cámara. Se reemplazó por **`scripts/cdp-capture-panel.py`**: un servidor local
(`localhost:8765`) con un botón "Capturar" que Edd abre junto a la pestaña del tour real
(su propio Chrome, CDP puerto 9222, perfil normal — no el navegador aislado de Claude).
Edd mueve la cámara a mano; el botón solo LEE el estado actual y arma una vista previa
(nunca escribe sin que él confirme). Server sin dependencias fuera de stdlib +
`websocket-client` (ya usado por `scripts/cdp_helpers.py`).

**El problema real que el panel resuelve**: 18 nombres de producto se repiten en el
catálogo (3× Tavolino Rio, 2× Divano Camden, 10-19× Boiserie genérica, etc.) — "¿a qué
fila le escribo esta captura?" no se puede responder por nombre. Cada hotspot del tour
trae su propio número de caja (`"b106 hotspot"` en el overlay == `"BOX 100 - B_106"` en
la hoja fuente), así que el panel identifica por ESE número, no por el nombre visible.

**Bugs reales encontrados y corregidos en vivo, cada uno con Edd cachándolo en el momento**:
1. La etiqueta cruda de un hotspot **no es única en todo el tour** — `"b110 hotspot"`
   existe tanto en el panel 9 (el Tavolino Rio real) como en el panel 19 (un hotspot
   suelto sin relación) — una escritura ciega pisó una captura ya buena. Fix: el flujo
   pasó a dos pasos — `/capture` solo previsualiza, `/confirm` escribe; y si la fila ya
   tenía `camera_verified` con un panorama muy distinto, sale una alerta roja antes de
   dejar confirmar.
2. Algunos hotspots están etiquetados con el **nombre del producto en vez de un número**
   (`"leaf hotspot"`, `"boiserie hotspot"`) — el panel hace fallback por palabra exacta
   contra `prodotto_ita`/`prodotto_eng`, priorizando coincidencia de nombre completo
   sobre coincidencia parcial (para no confundir "Boiserie" con "Boiserie camino"/
   "Boiserie TV", productos reales distintos).
3. Con nombres genéricos muy repetidos (ej. "Boiserie", 19 filas reales) el fallback por
   nombre solo no alcanza — se cruza además contra un **índice completo del tour**
   (`get_full_tour_index()`, un escaneo único de los 97 paneles vía
   `playlist.get("items")`, cacheado en memoria) que dice en qué panorama(s) existe
   REALMENTE cada número de caja. De los candidatos por nombre, se descartan los que no
   tengan hotspot real en el panorama actual — normalmente deja un solo candidato válido
   en vez de tener que adivinar entre 19.
4. Algunos hotspots tienen el marcador **sin `pitch`** (solo `yaw`) — el filtro original
   los excluía en silencio de la lista de candidatos, haciendo que el hotspot más cercano
   "real" perdiera contra uno lejano por error de cómputo. Fix: pitch por defecto 0 en
   vez de descartar.

**16 de los 48 productos "sin emparejar" (`unmatched-products.json`) sí tienen hotspot
real** — el matcher automático de Fase 2 solo falló al identificarlos, no es que no
existan. El panel los reconoce igual (`new_product: true` en la preview) y, al confirmar,
los **promueve** de `unmatched-products.json` a `matched-catalog.json` con la cámara real
capturada — el siguiente rebuild les da `product_id` real.

## El descubrimiento de los 13 "fantasma" — de dónde salió y qué se hizo

Al cruzar la lista de pendientes contra un escaneo en vivo de **los 1124 overlays de
cualquier tipo** en los 97 paneles (no solo los que terminan en `" hotspot"`), 13 filas
de `matched-catalog.json` (ya `isMatched: true` desde la Fase 2 original) resultaron sin
NINGÚN rastro de su número de caja en el tour — ni parcial, ni con otro formato.

**Verificado que no es una regresión de esta sesión**: los mismos 13 números tampoco
aparecen en `extracted-hotspots.json` (la extracción cruda original de `project.vtp`,
hecha en la Fase 2, muchísimo antes de esta sesión — 302 hotspots reales del archivo
nativo). O sea: **el Excel (`source-catalog.xlsx`) siempre documentó estas 13 ubicaciones
sin que el archivo 3D del tour las tuviera jamás** — no es que se hayan borrado después.
La pieza probablemente se quitó del showroom antes de escanear el tour, o es un error de
captura del Excel desde el origen. Lista completa exportada a
`Downloads/febal-casa-productos-fantasma.xlsx` para que Andrea confirme.

**Buena noticia verificada**: los 13 no dejan ningún nombre de producto sin cobertura —
los 13 tienen al menos un "hermano" (misma fila de producto, otra ubicación real) ya
capturado y verificado. De paso se encontró y corrigió un typo de doble-espacio
(`"Armadio  Collezione Momenti."` vs `"Armadio Collezione Momenti."`) que hacía parecer
huérfano a uno de los 13 cuando en realidad sí tenía hermano.

**El riesgo real que sí había que arreglar**: `active` en el pipeline (`build-febal-
catalog.mjs`) solo dependía de `isMatched` (si la fila viene de `matched-catalog.json`),
sin importar si la cámara es real o basura nunca verificada. Las 13 filas fantasma
seguían `active: true`, con riesgo real de que el modelo eligiera esa fila rota en vez
del hermano bueno y mandara al visitante a una posición de cámara sin sentido — con el
hermano bueno ahí sentado sin usarse. **Fix aplicado**: cada una de las 13 filas tiene
ahora `no_live_hotspot: true` + `_ghost_reason` en `matched-catalog.json`;
`build-febal-catalog.mjs` calcula `hasCoords = (isMatched || manual) && !row.no_live_hotspot`,
así que quedan `active: false` en `catalog.json` (invisibles para `search.ts`/
`recommendations.ts`/`variants.ts`, que ya filtran por `active`) sin tocar sus hermanos.
**Estado actual, verificado**: 101 filas en `matched-catalog.json`, **88 activas** (las
que sí tienen cámara real o hermano cubriendo el nombre), 13 con `no_live_hotspot`.

## Cómo trabajar

- Commits pequeños y descriptivos, estilo del repo ya existente (`git log --oneline` para ver el tono — sin tags de rol tipo `[implementer]`, solo mensajes claros en inglés).
- Después de cualquier cambio en `scripts/build-febal-catalog.mjs` o en datos del catálogo, **regenerar** `clients/febal-casa/catalog.json`/`.full.json`/`.xlsx` corriendo el script, y el bundle de producción con `node scripts/build-tour-bundle.mjs febal-casa`.
- Verificar con `npx tsc -p tsconfig.json --noEmit` en el paquete tocado, y `npm run build:core` desde la raíz, antes de dar algo por terminado.
- No hacer push sin que Edd lo pida.
