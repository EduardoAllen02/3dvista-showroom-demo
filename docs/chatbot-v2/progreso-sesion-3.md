# Progreso de la sesión 3 (Objetivos 3 a 6)

> Lo ejecuta la sesión orquestadora a pedido de Edd.
> Última actualización: 2026-09-23.

## Decisiones de Edd (checkpoint Obj. 3)
- **D1.** Refactor aprobado ("dale, el caso es que funcione").
- **D2.** Modelo: **nada de Sonnet**. Se trabaja con el GPT actual (gpt-4o-mini) y luego se compara con GPT baratos (gpt-6-luna, gpt-5-mini, gpt-5-nano). gpt-4o "normal" queda descartado porque cuesta más que Sonnet.
- **D3.** Umbral de error 0: queda el propuesto por defecto (pass^5 con datos revisados por Andrea + UX en vivo).
- **D4.** "Llévame a X" con destino único navega directo. Es configurable.
- **D5.** Sin respuesta todavía. **No se ha hecho ningún commit**; todo el trabajo va en archivos nuevos, salvo un export añadido en `packages/model-adapters/src/index.ts`.

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

## Métricas de la suite (gpt-4o-mini, datos en modo dev, sin validar)

| Corrida | Plantilla de respaldo | Reparaciones | Costo/turno | p50 | p95 |
|---|---|---|---|---|---|
| run1 | 11/22 | 2 | $0.00086 | 4,0 s | 4,7 s |
| run3 | 0/22 | 1 | $0.00077 | 2,9 s | 3,6 s |
| run4 | 0/22 | 6 | $0.00085 | 2,6 s | 5,2 s |

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
1. **Capturas del tour** (esperan a Edd), para las piezas sin observación y las dudosas:
   - FEB-036 Vivienne anotada como "pelle" a ojo: el bot dice "sí, de piel" y probablemente es Nabuk Eagle;
   - Arden vs Arden Soft; Barret-Portale; Momenti; FEB-056 Astrid/Marlene.
2. Excel de revisión para Andrea (Paso 6), incluidas las armonías y los estilos propuestos.
3. Integración en `server` con el flag `ASSISTANT_ENGINE=v2` y el widget:
   - grupos y chips de motivo;
   - enlace "Sito ufficiale ↗";
   - contexto del visor.
4. Bake-off de GPT baratos con la misma batería. Suite dorada sobre un catálogo ficticio congelado.

## Bloqueos
- Las capturas necesitan a Edd (Chrome al frente, sin usar la PC).
- D5 (commit baseline) sin respuesta.

## Gasto en APIs
≈ US$0.07, en 4 corridas de 22 turnos con gpt-4o-mini.
