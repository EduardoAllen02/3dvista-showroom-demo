# Progreso de la sesión 3 (Objetivos 3 a 6)

> Lo ejecuta la sesión orquestadora a pedido de Edd.
> Última actualización: 2026-09-23.

## Decisiones de Edd (checkpoint Obj. 3)
- **D1.** Refactor aprobado ("dale, el caso es que funcione").
- **D2.** Modelo: **nada de Sonnet**. Se trabaja con el GPT actual (gpt-4o-mini) y luego se compara con GPT baratos (gpt-6-luna, gpt-5-mini, gpt-5-nano). gpt-4o "normal" queda descartado porque cuesta más que Sonnet.
- **D3.** Umbral de error 0: queda el propuesto por defecto (pass^5 con datos revisados por Andrea + UX en vivo).
- **D4.** "Llévame a X" con destino único navega directo. Es configurable.
- **D5.** Hecho: commit baseline `b55c9a2` y commit del motor v2 `ed5e066` (sin push). Lo de este corte (capturas, Excel, diagrama) está sin commitear.

## Hecho

### Datos (la sesión de datos se absorbió aquí)
- Parser del scraper corregido. El `alt` de la web borra `_r` y ahora se restaura: 86 etiquetas en las 5 fichas de prueba.
- Scrapeo completo: 56/56 fichas, 5.055 opciones.
- `url-overrides.json`: Couple y Barret corregidas; Arden, Barret-Portale y Momenti quedan pendientes de captura.
- `tabla-88` con su Excel.
- Lectura manual de las 56 fichas → `model-attributes.json`. Hallazgo clave: 18 listas son **paletas genéricas**, no opciones del modelo.

### F0: esquema, ontología y compilador (`packages/assistant-engine/src/{catalog,ontology}`)
- Modelo / Pieza expuesta / Opciones / Hechos, con tri-estado y `options_complete`.
- Pack de ontología es/it/en con falsos amigos (piel ≠ similpiel ≠ nobuk), familias de color, tonos, armonías (BORRADOR hasta que Andrea las firme) y moods.
- Propuestas de familia de color (1.133 nombres únicos, 238 marcados para revisión) y de material por colección.
- `scripts/build-catalog-v2.ts` → `clients/febal-casa/catalog.v2.json` + gates.

### F1: motor + oráculo
- `engine/engine.ts`: niveles expuesto / bajo pedido / sin confirmar y relajación jerárquica por costos. Modos lista, alternativas, recomendación, ubicación, detalle y ánimo ("acogedor").
- `eval/oracle.ts`: implementación independiente.
- `test/oracle-diff.test.ts`: **18.854 combinaciones, 0 diferencias**.

### F2a: capa LLM (`src/turn/*`)
- Planificador con JSON estricto y vocabulario cerrado.
- Reductor: valida ids, cruza con el lexicón y aplica los invariantes. Detecta negaciones. Si cambia la categoría, abre un tema nuevo.
- Render por etiquetas: nombres, zonas, opciones bajo pedido, enlaces y medidas los pone el código.
- Verificador: V1 etiquetas, V3 atributos sin respaldo, V4 números, V5 nombres, V7 idioma, V8 zonas, V9 obligaciones.
- Autocompletado del enlace, una reparación y plantillas deterministas en es/it/en.
- Cliente OpenAI con structured outputs (`packages/model-adapters/src/openai-json.ts`).
- Ejecutor `scripts/v2-chat.mts` con 14 conversaciones (22 turnos) sobre los casos de uso.

### Capturas del tour (88/88, 2026-09-23)
- `scripts/cdp_nav_one.py`, una pieza por llamada, por API y sin arrastre.
  - Hallazgo: `activePlayer.set("yaw"…)` cambia las propiedades pero **no repinta la vista**; `activePlayer.setPosition(yaw, pitch, 0, hfov)` sí.
  - El widget "Llévame" usa `set()` en la misma panorámica, así que puede no moverse. Quedó como tarea aparte.
- `placements.json` con 88 entradas binarias con evidencia:
  - visible 87 (FEB-094 mal encuadrado);
  - color 88, material 42, forma 88;
  - opción oficial exacta 6.
- **8 errores del catálogo v1 corregidos.** Ejemplos:
  - FEB-004 Rio es de madera, no de mármol;
  - FEB-027 Camden es verde, no "cognac";
  - FEB-017 Windsor no es verde oliva;
  - FEB-013 Aurora no tiene nogal.
- **FEB-036 Vivienne.** El material queda SIN confirmar, así que el bot ya no dice "de piel" (verificado en la batería).
- **Datos resueltos:**
  - Arden (FEB-101) es cabecera de madera, no Soft: confirmado.
  - Barret-Portale (FEB-099) es compatible con battente.
  - FEB-056 se volvió a enlazar de Astrid a Marlene (`url-overrides.json`, pendiente de Andrea).
  - FEB-034 Phoenix sí se ve (el "detrás de una puerta" era la cámara que no se movía).

### Correcciones de datos y motor en este corte
- **Codificación.** `facts-placement.py` y `facts-record.py` leían stdin como cp1252 y dañaban los acentos; ahora leen bytes UTF-8.
- **Etiquetas de opciones.** `scripts/facts-clean-labels.py` limpia 467 etiquetas y guarda el original en `label_raw`:
  - "Copia di FebalCasa_…_Finiture_";
  - "C ";
  - "Opacoosa/Lucidoosa/CosaAntico" → "Rosa antico";
  - "Ilaccato".
- **Material.** Un componente secundario ya no puede volverse el material dominante. El motor y el oráculo responden "no" solo si el material dominante es conocido.
- **Forma expuesta.** Sale solo de la captura: la v1 mezclaba el rango del modelo, p. ej. Madeira "rotondo o ovale, allungabile".
- **Ontología.** Nuevas formas:
  - en U, cilíndrico, envolvente, sin brazos, con brazos;
  - con reposapiés, sin puertas (a giorno), para TV;
  - matrimonial, de una plaza.
  - Además: "da terra a soffitto"; los colores nocciola/avellana y talpa; se resolvieron choques con categorías.
- **Tarjetas y redactor.** Los colores observados se traducen: "grigio caldo" → "gris cálido". El redactor ya no escribe "se ve así".

### Entregables
- Excel de revisión: `~/Downloads/febal-casa-revision-2026-09-23.xlsx`.
  - Se genera con `scripts/build-review-xlsx.py`.
  - 11 hojas: piezas con foto, modelos, 5.138 opciones con muestra, sinónimos, colores → familia, materiales, estilos, armonías, ánimos, errores v1 y preguntas P1–P23.
  - v2 del Excel (`febal-casa-revision-2026-09-23-v2.xlsx`): "Opciones oficiales" trae solo listas propias y de texto (2.392 filas), ordenadas como se recorre el tour. Las paletas genéricas quedan una sola vez: 34 en "Paletas por confirmar" y 399 opciones en "Paletas genéricas", en lugar de 2.746 filas repetidas.
  - v4 (`febal-casa-revision-2026-09-25-v4.xlsx`), la vigente:
    - el "Léeme" explica todo el archivo con tablas (fuentes, por qué hay dudas, marcas, cómo marcar, niveles de opciones, paletas, hoja por hoja, colores, qué sigue, glosario);
    - las notas se marcan como CORREGIDO (ya aplicado, verde), DUDA (naranja) y PENDIENTE (en el tour, rojo); la hoja «Errores» pasa a llamarse «Correcciones»;
    - la columna de piezas se llama «Opción del showroom».
- Paletas de línea («Finiture per NOTTE» = línea Dormitorio, y la de armarios): decisión de Edd (2026-09-25), opción A.
  - Nuevo alcance `line`: el motor tiene un nivel "de la línea" después del bajo pedido.
  - La obligación `lin:` obliga a decir "{{line}} maneja {{v}}; confirma en {{link}} si aplica a este modelo". El verificador rechaza "bajo pedido" o que falte el aviso.
  - No se menciona donde la ficha la contradice (`paleta_de_linea: NO` en `model-attributes.json`): Arden (madera), puerta Aurora y Profile Reflex (vidrio).
  - La revisión puede promoverla a opción normal (SI) o descartarla (NO / modelos excluidos).
  - El oráculo cubre el nivel nuevo: 22.664 combinaciones, 0 diferencias.
  - Batería run8 (24 turnos, con C15 "Couple/Arden en azul"): 0 plantillas, 4 reparaciones, $0.00083/turno.
- Reductor: acepta referencias con el id pegado al nombre ("FEB-101 Letto Arden"). Una "variante" usa también el modelo nombrado en el mensaje.
- Importador de la revisión: `scripts/import-review-xlsx.py` → `review.reviewed.json` + `review-corrections.json`.
  - Un SI en "Paletas por confirmar" agrega los grupos a `promoted_palette_groups`, y el compilador los vuelve ofrecibles (alcance "model"), excepto en los modelos excluidos.
- Diagrama interactivo: `docs/chatbot-v2/arquitectura-v2.html`, publicado en https://claude.ai/artifact/MdbnP2owKAdRB3mt1vCarU (privado; Edd lo comparte).

## Métricas de la suite (gpt-4o-mini, datos en modo dev, sin validar)

| Corrida | Plantilla de respaldo | Reparaciones | Costo/turno | p50 | p95 |
|---|---|---|---|---|---|
| run1 | 11/22 | 2 | $0.00086 | 4,0 s | 4,7 s |
| run3 | 0/22 | 1 | $0.00077 | 2,9 s | 3,6 s |
| run4 | 0/22 | 6 | $0.00085 | 2,6 s | 5,2 s |
| run5 (datos de capturas) | 1/22 | 5 | $0.00081 | 2,9 s | 4,6 s |
| run6 (+ ajustes de redacción) | 0/22 | 4 | $0.00094 | 2,6 s | 4,6 s |

Las trazas completas están en `eval/runs/`.

Casos ya resueltos de punta a punta con datos reales:
- **UC-1** cuero: no hay; Balmoral en Nabuk Eagle bajo pedido; valores reales.
- **UC-2** "¿lo tienes en café?": regla de Andrea con enlace a la ficha.
- **UC-3** ángulo + amarillo: Melrose y Balmoral bajo pedido en Mustard/Sunflower/Curry, más el sillón Astor en mostaza como opción física.
- **UC-4** cambio de tema a cocinas.
- **UC-6** mesa redonda + medidas reales.
- **UC-7** rosa bajo pedido e industrial → valores reales.
- **UC-10** ubicación en 2 zonas y navegación.
- **UC-11** it/en.
- **UC-14** acogedor.
- **UC-15** negación.

## Siguiente
1. Edd envía el Excel a Andrea. Con su respuesta:
   - `python scripts/import-review-xlsx.py <archivo>`;
   - aplicar `review-corrections.json`;
   - `npx tsx scripts/build-catalog-v2.ts febal-casa --strict`.
2. Tarea aparte: "Llévame" en la misma panorámica con `setPosition` (widget).
3. Integración en `server` con el flag `ASSISTANT_ENGINE=v2` y el widget:
   - grupos y chips de motivo;
   - enlace "Sito ufficiale ↗";
   - contexto del visor.
4. Bake-off de GPT baratos con la misma batería. Suite dorada sobre un catálogo ficticio congelado.

## Bloqueos
- Ninguno técnico. Falta la revisión de Andrea (hechos validados: 0/818).

## Gasto en APIs
≈ US$0.13, en 7 corridas de 22 turnos con gpt-4o-mini.
