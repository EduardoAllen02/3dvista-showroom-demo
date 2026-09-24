# 03 — Decisión de refactor (Objetivo 3)

> **Estado: PROPUESTA, pendiente del checkpoint con Edd** (sección 8). No se ha tocado código.
> **Fecha:** 2026-09-23.
> **Insumos:**
> - [`01-analisis-arquitectura-actual.md`](01-analisis-arquitectura-actual.md), con sus referencias `archivo:línea` re-verificadas hoy contra el working tree;
> - [`02-arquitectura-clean-room.md`](02-arquitectura-clean-room.md);
> - [`casos-de-uso-y-criterios.md`](casos-de-uso-y-criterios.md);
> - una lectura de lo reutilizable en `packages/` y `server/`.

## 0. Decisión en una página

**Se adopta el núcleo de la arquitectura clean-room.** El resto del sistema se conserva. La migración es incremental, con patrón *strangler*: una v2 detrás de un flag, mientras la v1 sigue sirviendo hasta que la v2 pase la suite.

| Se reemplaza (el "cerebro", ~1.9K líneas) | Se conserva (el "cuerpo", ~2.6K líneas) |
|---|---|
| Búsqueda por keywords, *matching*, similitud, variantes y familias de color de `catalog-engine` | Widget (`assistant-ui`): tarjetas, wishlist, corazón sobre hotspots, moodboard |
| `server/src/agent/*` (orquestador, 6 tools, las 3 rutas de modelo) y `prompt.md` con ~20 reglas-parche | `tour-bridge`: "Llévame" (`player-api-navigator`), lector de cámara, panel nativo |
| `tool-schemas.ts` + `claude-code-tools.ts`, que están duplicados | `assistant-core`: estado de chat y wishlist, cliente HTTP |
| El catálogo plano por pieza y su pipeline xlsx↔json | La interfaz `ModelProvider` y los adaptadores OpenAI/Anthropic, como base del `LLMProvider` |
| | La ruta `POST /chat`, con el contrato extendido, y el build del bundle |

**Por qué el núcleo sí.** El análisis del Objetivo 1 encontró que las causas raíz son estructurales:
- no hay distinción entre pieza expuesta y modelo;
- no hay sinónimos ni familias de color;
- la búsqueda por keywords decide qué ve el LLM;
- no hay estado;
- solo una tool pinta tarjetas;
- el prompt está lleno de parches contradictorios.

La clean-room responde exactamente a esas causas: tri-estado, motor exhaustivo, estado con invariantes, tarjetas por grupos y verificación. Un refactor parcial de la v1 terminaría reconstruyendo la misma cosa con más deuda.

**Por qué no reescribir todo.** La UI, la navegación y la wishlist funcionan, las probó Edd en vivo y la clean-room no las cambia en esencia. Tirarlas no aporta nada al error 0.

**Modelo.**
- **Claude Sonnet 5, provisional.** Adaptive thinking, `effort: low`, caché de 1 h sobre el prefijo estático.
- **Se confirma con un *bake-off* medido** (sección 4). Para medirlo hace falta una `ANTHROPIC_API_KEY`, que hoy **no existe** en `server/.env`.
- **Fallback:** el adaptador OpenAI, con el modelo que pase la suite, y un modo degradado determinista.

**Recortes pragmáticos respecto a la clean-room** (catálogo de 88 piezas, un solo tour, un solo servidor):

| Clean-room | Aquí | Por qué |
|---|---|---|
| Oráculo en DuckDB/SQL | Oráculo en TypeScript, por fuerza bruta, en `eval/oracle/` **sin importar código del motor** | Lo que importa es que sea independiente, no el motor SQL. Evita una dependencia nueva |
| Store de estado genérico | Memoria con TTL de 30 min, detrás de la interfaz `StateStore` | Hay una sola instancia en EC2. Redis se agrega cuando haga falta |
| Verificador V1–V10 completo antes de F2 | **Etapa 1:** etiquetas + V1, V4–V9. **Etapa 2:** V2/V3 (claims + escaneo del lexicón) | La etapa 1 ya bloquea nombres, números, enlaces y obligaciones inventados, que son los fallos más graves y más baratos de atrapar |
| Suite v1 de ~250 conversaciones | **~60 conversaciones críticas** (los 16 UC × ramas de datos × es/it/en) + metamórficas; se amplía con cada incidente | Costo por corrida de ~US$4–5 (sección 4.4) |
| Bake-off Sonnet 5 / GPT-6 Sol / Gemini 3.8 Flash / Opus 5.5 low | Sonnet 5, Opus 5.5 low, GPT-6 Sol y gpt-4o-mini (línea base) | Gemini exige clave y adaptador nuevos. Se agrega solo si Edd lo pide |

---

## 1. Matriz de decisión, componente por componente

| # | Componente | Hoy (evidencia) | Clean-room | Decisión | Costo / riesgo | UC que desbloquea |
|---|---|---|---|---|---|---|
| 1 | **Modelo de datos** | Un registro plano por pieza; `colors`/`materials` en texto libre; 21/88 con material; sin opciones bajo pedido (`packages/catalog-engine/src/schema.ts`) | `Model` / `OptionGroup` / `Option` / `Exhibit` / `Fact`, con atributos tri-estado y `options_complete` (§2.2) | **Adoptar** | Medio. Depende de los datos de la sesión de datos y de la validación de Andrea | 1, 2, 3, 5, 6, 7, 12 |
| 2 | **Ontología** (sinónimos, falsos amigos, familias, tono) | `synonyms` vacío en las 88; `COLOR_FAMILIES` cubre 3/19 y no tiene amarillo (`color-families.ts`) | Pack multilingüe con conceptos, lexicón es/it/en, falsos amigos (pelle ≠ nabuk ≠ similpelle) y relaciones con distancia (§2.3–2.4) | **Adoptar** | Bajo en código, medio en curaduría | 1, 5, 6, 7, 11 |
| 3 | **Armonía "combina con" y moods** | No existen | Tabla curada y **firmada**; sin firma, la función se desactiva (§2.4) | **Adoptar**. Claude redacta el borrador; **Andrea firma** | Bajo. Depende de la firma | 3, 8, 14 |
| 4 | **Recuperación** | Scoring por keywords sobre el mensaje crudo en español; los tokens de 2 letras hacen match por substring (`search.ts:49-52`); lo que no puntúa se descarta (`search.ts:127-129`); igualdad exacta (`matching.ts:4-7`) | Motor exhaustivo tri-estado con niveles T1 expuesto, T2 bajo pedido, U desconocido y R relajación (§6.1–6.2) | **Adoptar**. Reemplazo total | Medio. Lo cubre el oráculo | Todos |
| 5 | **Relajación** | Solo el color y en un paso (`server/src/agent/tools.ts:172-190`) | Costos por faceta × rol × énfasis; grupos "conserva el marco" y "conserva lo nuevo" (§6.3–6.4) | **Adoptar**, con los pesos de §6.4 como valores por defecto configurables | Bajo | 3, 5, 7 |
| 6 | **Estado conversacional** | Sin estado. El único ancla son los `product_ids` de la última respuesta (`orchestrator.ts:94-100`) | `ConversationState` + reductor + invariante de cambio de tema (§4) | **Adoptar**, con store en memoria y TTL | Bajo | 2, 3, 4, 9, 15 |
| 7 | **Contexto del visor** | No se envía (no hay `focus_product_id`). El widget ya lee panorámica y cámara (`tour-bridge/src/camera-reader.ts`) y proyecta hotspots (`assistant-ui/src/hotspot-projection.ts`) | El widget envía `viewer {pano_id, centered, visible[]}` en cada turno (§3.3) | **Adoptar**, reutilizando ese código | Bajo | 2, 9 |
| 8 | **Contrato con el LLM** | 6 tools; `prompt.md` con ~20 reglas-parche; contradicción de idioma entre `tool-schemas.ts:19` ("en español…") y la regla 10b de `prompt.md` (italiano) | `plan_turn` y `respond` estrictos, vocabulario cerrado y prompt corto (§4.2, §7.2) | **Adoptar**. Se eliminan `prompt.md`-v1 y los esquemas duplicados | Bajo | Todos |
| 9 | **Orquestación** | 3 rutas (OpenAI, Anthropic raw, Agent SDK); loop de hasta 4 llamadas; primera llamada forzada a tool | Gateway único: plan → reductor → motor → redacción, en la misma conversación cacheada; vía rápida para eventos de la UI (§3) | **Adoptar**. Se retira la ruta Agent SDK del runtime (latencia) | Medio | Todos |
| 10 | **Tarjetas en varios grupos, con motivo** | Solo la primera tool de propuesta pinta tarjetas (`orchestrator.ts:209-218`); la tarjeta no dice por qué aparece (`assistant-core/src/types.ts`, `ProductCard`) | Grupos con título, chips de motivo y `availability` (expuesto / bajo pedido + `shown_as`) (§6.5) | **Adoptar**. Cambia `chat-card.ts` y `product-card.ts` | Bajo-medio (UI) | 1, 3, 13 |
| 11 | **Enlace a la ficha oficial (regla de Andrea)** | **Hueco que la clean-room no podía conocer:** en el tour, "Vedi scheda" navega a la pieza y abre el **panel nativo** de 3DVista (`chat-card.ts:100-103`), no febalcasa.com. Solo la wishlist enlaza a `detail_url` | Supone que "Ver ficha" abre `official_url` | **Adaptar:** se conserva "Vedi scheda" (panel nativo) y se agrega un enlace explícito "Sito ufficiale ↗" a la URL oficial del modelo en las tarjetas `on_order`; en el texto, `{{link:M}}` se renderiza como ese enlace | Bajo | 2, 3 (E10) |
| 12 | **Render por etiquetas y verificador** | No existe; todo depende de reglas del prompt | Etiquetas `{{p}} {{v}} {{c}} {{z}} {{f}} {{link}}`, claims, obligaciones, V1–V10, reparación y luego plantilla (§7) | **Adoptar en 2 etapas** (sección 0) | Medio | Todos (E1, E5, E9, E10) |
| 13 | **Streaming** | Una sola respuesta JSON (`server/src/routes/chat.ts`) | SSE: primero las tarjetas, luego los segmentos ya verificados (§3.3) | **Adoptar en F3** | Medio (servidor + widget) | Latencia < 8 s |
| 14 | **Navegación** | La tarjeta lleva `navTarget` con cámara para el frontend; el LLM **no** la ve (`tools.ts:222-230`). La confirmación solo existe como regla de prompt | Tabla privada `viewpoint`, más una política de confirmación en código (§7.6) | **Mantener** el mecanismo y **agregar** la política en código | Bajo | 10, 16 |
| 15 | **Modelo LLM** | gpt-4o-mini (`server/src/config.ts:20`) | Sonnet 5, adaptive, effort low (§9) | **Adoptar como provisional** → bake-off (sección 4) | Costo ~13× por turno, dentro del objetivo | 11 y reglas finas |
| 16 | **Evaluación** | Sin tests; baterías manuales con ids viejos | Oráculo independiente + pruebas diferenciales + suite dorada + metamórficas + juez (§10) | **Adoptar**, con tamaño ajustado | Medio | Es la medición del error 0 |
| 17 | **Pipeline de datos** | xlsx↔json pierde `compatible_with`; `synonyms` se regenera vacío; el enriquecimiento vive solo en `catalog.json` | Hechos con evidencia → hoja SÍ/NO → validación humana → compilador con *gates* → catálogo versionado (§2.7) | **Adoptar**, con `product-facts/*.reviewed.json` como entrada | Medio. Depende de Andrea | Todos |
| 18 | **Portabilidad** | Acoplado a Febal (textos IT sin i18n, schema con campos de 3DVista, backend de un solo tour) | Packs de ontología, políticas, adaptador de catálogo y *binding* del tour (§11) | **Adoptar las interfaces desde F1** (cuesta poco si se hace desde el inicio); la extracción completa queda para el Obj. 6 | Bajo | Obj. 6 |

---

## 2. Cobertura de casos de uso

| UC | Hoy (Obj. 1) | Con la v2 | Condición para que quede ✅ |
|---|---|---|---|
| 1 Cuero / sinónimos | ❌ | ✅ lexicón + falsos amigos + T2 + relajación leather→nubuck/similpelle | Andrea confirma si Nabuk Eagle es piel |
| 2 "¿Lo tienes en café?" | ❌ | ✅ foco (visor / tarjeta / navegación) + T2 con la regla de Andrea | `options_complete` validado; URL oficial correcta |
| 3 Ángulo + amarillo | ❌ | ✅ relajación de 2 grupos + armonía | Tabla de armonías firmada |
| 4 Cambio de tema | ⚠️ | ✅ invariante de categoría en código | — |
| 5 Generalización | ❌ | ✅ el motor es genérico por faceta | Facetas núcleo validadas |
| 6 Forma + sinónimos | ⚠️ | ✅ lexicón + `shape_configs` (Madeira redonda/ovalada) | Forma validada (gate) |
| 7 Atributo inexistente | ⚠️ | ✅ `vals:` + cercanía | — |
| 8 Recomendación | ⚠️ | ✅ co-exposición + estilo + armonía | Estilos validados o propuestos como curados (hoy casi ninguna ficha dice el estilo) |
| 9 Referencias | ❌ | ✅ estado + visor + validación de referencias | — |
| 10 Guía / navegación | ⚠️ | ✅ política en código + desambiguación por zona | **D4**: ¿"llévame a X" cuenta como confirmación? |
| 11 Multi-idioma | ⚠️ | ✅ idioma decidido por código + V7 | Lexicón es/it/en completo |
| 12 Detalle técnico | ❌ | ⚠️ correcto (dice "no lo tengo" + ficha), pero **útil solo donde hay dato**: pocas fichas traen medidas | Cobertura de medidas (la reporta la sesión de datos) |
| 13 Listados | ⚠️ | ✅ modo `list` | — |
| 14 Petición vaga | ⚠️ | ✅ inferencia declarada + tabla de moods | Tabla de moods firmada |
| 15 Correcciones / negaciones | ⚠️ | ✅ `remove` / `replace` / `not` en el reductor | — |
| 16 Fuera de alcance | ⚠️ | ✅ sin herramientas peligrosas + V4/V10 | — |

**Lo que ninguna arquitectura resuelve sin datos:** medidas ausentes (UC-12), estilos que la ficha no declara (UC-8, UC-14) y opciones de fichas sin sección de acabados (Rio, Andy…). En esos casos la v2 no falla: responde "no lo tengo confirmado" más la ficha. Por diseño, es correcto; no es un error 0 "útil".

---

## 3. Alcance y migración (cómo, sin romper lo que funciona)

**Paquetes nuevos** (propuesta; la implementación puede ajustar los nombres):

```
packages/catalog-core/     esquema canónico (Model/Exhibit/OptionGroup/Option/Fact), compilador desde product-facts, gates,
                           pack de ontología "furniture" (lexicón es/it/en, familias, armonías, moods)
packages/query-engine/     tri-estado, niveles T1/T2/U/R, relajación, list/alternatives/recommend/locate/detail → Bundle
packages/response-verifier/ render de etiquetas, claims, obligaciones, V1–V10, plantillas por desenlace e idioma
server/src/turn/           gateway, StateStore, planner, reducer, composer, política de navegación, trazas
eval/                      oracle/ (independiente), fixtures/ (catálogo ficticio de la §8 clean-room), golden/, runner
```

**Estrategia strangler:**
1. La v2 vive junto a la v1. El flag `ASSISTANT_ENGINE=v1|v2` en `server/.env` elige el camino en `POST /chat`.
2. El contrato de `/chat` crece de forma **retrocompatible**: `viewer`, `session_state_version`, `card_groups[]` y `availability`. El widget v1 sigue funcionando.
3. La v1 sigue desplegada en EC2 hasta que la v2 pase la suite con datos `.reviewed.json`. Entonces se borran la v1, `prompt.md`-v1, las 3 rutas y el pipeline xlsx.

**Identificadores:**
- **`Exhibit.id = product_id` actual (FEB-xxx).** La wishlist guardada en el navegador de los visitantes usa esos ids, y cambiarlos la rompería.
- `Model.id`: slug de la URL oficial, después de `url-overrides.json`.

**Qué no se puede romper** (entra a la suite como regresión):
- mesa redonda (GC-04 / Madeira);
- "Llévame" y el panel nativo;
- corazón y wishlist;
- moodboard;
- textos de la UI en italiano.

---

## 4. Modelo LLM

### 4.1 Datos verificados

**Fuentes:**
- la tabla de modelos y precios de la skill oficial `claude-api` (caché del 2026-06-24);
- la verificación en vivo de la sesión 2 (2026-09-23).

Ambas coinciden.

| Modelo | Entrada / Salida por 1M tokens | Caché: escritura 5 min / 1 h / lectura | Mín. cacheable | Razonamiento | Notas de API relevantes |
|---|---|---|---|---|---|
| **claude-sonnet-5** | $2 / $10 | $2.50 / $4 / $0.20 | 1.024 | Adaptive o desactivado; effort de low a max | Rechaza `temperature`/`top_p` (400); sin prefill; `strict: true` en tools |
| claude-opus-5-5 | $4 / $20 | ×1.25 / ×2 / $0.20 | 512 (familia Opus 5) | **No se puede desactivar**; effort por defecto `medium` | `tool_choice` forzado (`any`/`tool`) devuelve 400 → usar `auto` + `strict` |
| claude-haiku-4-5 | $1 / $5 | ×1.25 / ×2 / $0.10 | **4.096** | Solo `budget_tokens`; **no soporta effort** | Contexto de 200K. La sesión 2 reporta "retiro no antes del 2026-10-15"; la caché de junio lo marca activo. No se usa como dependencia |
| claude-fable-5-1 | $10 / $50 | — / — / $0.25 | 512 | Siempre activo | Fuera de presupuesto por turno |

**Configuración propuesta para Sonnet 5:**
- `thinking: {type: "adaptive"}` en el planificador;
- `output_config.effort: "low"`;
- tools `plan_turn` y `respond` con `strict: true`, y `eager_input_streaming` en `respond`;
- `tool_choice: auto` + instrucción, que es compatible con Opus 5.5 si ganara el bake-off;
- breakpoint explícito con `ttl: "1h"` al final del prefijo estático (tools + sistema + ontología + índice), más caché automática para la cola;
- pre-calentamiento con `max_tokens: 0` al abrir el tour.

### 4.2 Costo esperado

Con el perfil de la clean-room (§9.2: ~26K tokens leídos de caché, ~3K nuevos y ~500 de salida por turno), Sonnet 5 cuesta **≈US$0.018 por turno** y ≈US$140 por cada 1.000 conversaciones de 8 turnos. Eso queda por debajo del objetivo de Edd de US$0.02–0.05. Opus 5.5 con effort low cuesta ≈US$0.038 por turno: cabe en costo, pero probablemente no en latencia, porque razona siempre (≈4.8 s hasta el primer token, según Artificial Analysis).

### 4.3 Latencia: **aún no medida por API directa**
- `server/.env` solo tiene `OPENAI_API_KEY`. No hay `ANTHROPIC_API_KEY` ni `ant` CLI en esta máquina.
- Las cifras de la clean-room (p50 ≈7 s con dos llamadas) son **estimaciones con datos de terceros**. Las viejas de 16–29 s pasaban por el Agent SDK y no sirven.
- **Bloqueante para el bake-off (F2b):** Edd agrega la clave a `server/.env`. Claude nunca la escribe ni la lee en claro.
- **Criterio del bake-off, en este orden:**
  1. pass^5 crítico = 100 %;
  2. p95 extremo a extremo ≤ 8 s (las tarjetas ≤ 3.5 s);
  3. costo.

### 4.4 Costo de la evaluación
- **Suite v1:** ~60 conversaciones, ~240 turnos × US$0.018 ≈ **US$4.3 por corrida** (sin contar lo que pasa por el motor sin LLM).
- **pass^5:** ≈ US$22. Se corre solo para declarar el error 0 y en cambios de modelo.
- **En cada iteración:** pass^3 sobre el subconjunto crítico, ≈ US$8–13.
- **Pruebas sin costo:** el motor contra el oráculo y los planes fijos en modo *replay*. Son la mayoría de las pruebas.

---

## 5. Esquema de datos y mapeo desde `product-facts/`

| Fuente (sesión de datos) | → Esquema canónico | Nota |
|---|---|---|
| `models.json` (scraper: colecciones → opciones con label, código y `swatch_hex`) | `Model.option_groups[]` → `OptionGroup` → `Option` (`official_name`, `swatch.lab` desde el hex) | El encabezado del grupo en la ficha define `applies_to` (rivestimento → upholstery; ante → doors; piano → top…) |
| `model-attributes.json` (lectura manual SÍ/NO) | `shapes`, `shape_configs`, `dimensions`, `structure`, `styles` como `Attr` tri-estado | NO en la ficha → `unknown/not_published`, **nunca "no"** |
| Confirmación de que "las listas del parser coinciden con la página" | `options_complete` | Si la ficha no tiene sección de acabados → `false` |
| `line-materials.json` (propuesta → revisada) | `OptionGroup.material` (concepto) | Nabuk Eagle queda pendiente de Andrea |
| `color-names.json` (propuesta → revisada) | `Option.color_family`, `tone` | Gate: 100 % de los nombres mapeados |
| `placements.json` (capturas) | `Exhibit.configuration[]` (rol, `option_ref` si es inequívoca, material, familia, **dominante**), `shape_as_shown` | Ver el ajuste a la sesión de datos, abajo |
| `url-overrides.json` | `Model.official_url` | Gate: responde 200 y corresponde al modelo |
| Cámaras verificadas (`catalog.json` = `matched-catalog.json`, 88/88) | Tabla privada `Viewpoint` (*tour binding*) | El LLM nunca la ve |
| Misma panorámica o escena (`media_name`, sección) | `co_exhibited_with` | Hecho observable, no opinión; no requiere firma |
| `*.reviewed.json` (Andrea) | `Fact.review.status = validated` | Lo `pending` llega al runtime como `unknown` |

**Ajustes necesarios en la sesión de datos** (ya aplicados en [`prompt-sesion-datos.md`](prompt-sesion-datos.md), que aún no arranca):
1. **Paso 4, por pieza:** registrar los componentes por **rol** (tapizado, estructura, patas, puertas, frente, tapa, base…) y marcar cuál es el **dominante**, es decir, la superficie que define "de qué color es".
2. **Paso 5:** proponer un estilo por modelo cuando la ficha no lo diga. Va marcado como `curado · propuesta` para que Andrea diga SÍ o NO; sin su SÍ queda `unknown`.

---

## 6. Plan por fases (Objetivos 4 a 6)

| Fase | Entregables | Criterio de salida | Depende de |
|---|---|---|---|
| **G0. Git** | Commit baseline del WIP con una lista explícita que Edd aprueba (hay fuentes del runtime **sin trackear**) + rama `chatbot-v2` | Edd aprueba la lista | D5 |
| **F0. Esquema y ontología** | `catalog-core`: tipos, compilador desde `product-facts`, *gates*; pack de ontología v1 es/it/en; **borradores de armonías y moods para que Andrea los firme** | Los gates corren (en rojo hasta que lleguen los datos revisados) | La sesión de datos, en paralelo |
| **F1. Motor + oráculo** | `query-engine`; oráculo independiente; pruebas diferenciales (todas las combinaciones de 1 a 3 restricciones); catálogo ficticio congelado (§8 de la clean-room) | 0 diferencias; los 16 UC producen el bundle esperado **sin LLM** | F0 |
| **F2a. Rebanada vertical** | Gateway, estado, planificador, reductor, redactor, render de etiquetas, verificador etapa 1, plantillas; suite dorada v1; **UC-1, UC-2 y UC-3 de punta a punta con la regla de Andrea (E10)** | **Checkpoint con Edd** (demo en vivo) | F1 + clave Anthropic |
| **F2b. Robustez** | Verificador etapa 2 (claims + lexicón); bake-off medido; adaptador de fallback; modo degradado | pass^3 crítico = 100 % en el principal | F2a |
| **F3. UI y latencia** | Grupos, chips y `availability` en las tarjetas; enlace "Sito ufficiale ↗"; contexto del visor; SSE; pre-calentamiento de la caché; vía rápida | p50 ≤ 7 s, p95 ≤ 8 s, tarjetas ≤ 3.5 s. **Checkpoint** | F2b |
| **F4 = Obj. 5. Error 0** | Cambio a `.reviewed.json`; iteración; retiro de la v1 | **D3** (sección 8) | Andrea validó |
| **F5 = Obj. 6. Componentes** | Extracción de packs (ontología, políticas, adaptador, *binding*), i18n de la UI, `06-componentes.md` | La misma suite en verde | F4 |

**Lo que se puede hacer ya, sin esperar a Andrea:** G0, F0, F1 y la mayor parte de F2a, sobre el catálogo ficticio y los datos crudos marcados como no validados.

---

## 7. Riesgos principales (además de §12 de la clean-room)

| Riesgo | Mitigación |
|---|---|
| La validación de Andrea tarda | F0–F2 avanzan sobre el catálogo ficticio. El error 0 solo se declara con datos revisados |
| Latencia de 2 llamadas > 8 s | Tarjetas antes que texto (SSE); mitigaciones M1–M6; bake-off con Opus 5.5 low solo si mejora el pass^5 |
| Dos sesiones en el mismo árbol (datos + implementación) | La implementación nunca toca `product-facts/**` ni los scripts `*facts*`/`cdp*`, y stagea rutas explícitas |
| Fuentes del runtime sin trackear en git | G0 antes de cualquier cambio |
| El panel nativo "Vedi scheda" se confunde con el enlace oficial | Dos acciones distintas y rotuladas (componente 11) |

---

## 8. Checkpoint: decisiones que necesito

**De Edd:**
- **D1.** ¿Se aprueba adoptar el núcleo clean-room con strangler, con los recortes de la sección 0? (sí / no / ajustes)
- **D2.** ¿Sonnet 5 como provisional? Si sí, que Edd ponga `ANTHROPIC_API_KEY` en `server/.env` para el bake-off.
- **D3.** Umbral para declarar el error 0. Propuesta: **pass^5 crítico = 100 % con datos `.reviewed.json` + una sesión de UX en vivo con Edd sin fallos**. El piloto de 2 semanas de la clean-room queda como monitoreo en producción, no como condición. (El prompt de la sesión 3 decía pass^3; pass^5 es más estricto.)
- **D4.** ¿"Llévame a X" por texto, con destino único, cuenta como confirmación? La clean-room dice que sí; hoy la regla es "nunca sin confirmar".
- **D5.** ¿Se hace el commit baseline del WIP + rama `chatbot-v2`? Propongo la lista de archivos antes de hacerlo.

**De Andrea** (van en la hoja "Preguntas abiertas" de su Excel):
- P1: ¿chaise longue o penisola cuentan como "de ángulo"?
- P3: ¿firma ella la tabla de armonías y moods?
- P4: ¿qué se dice si una pieza tiene un acabado descatalogado?
- P5: máximo de tarjetas (propuesta: 8, y 12 en listados).
- P6: ¿qué hacer con idiomas no soportados?
- P7: ¿las preferencias generales persisten entre temas?
- P8: canal de contacto cuando falta un dato.
- P9: ¿mostrar siempre algo físico cuando la coincidencia es solo bajo pedido? (Propuesta: sí.)
