# Chatbot Febal v2 — carpeta de contexto entre sesiones

Esta carpeta es el **traspaso de contexto** entre las sesiones de trabajo del rediseño del chatbot de Febal Casa (asistente recomendador y guía embebido en el tour virtual).

## Objetivo general
Entregar el mejor chatbot posible: un verdadero recomendador de muebles y guía por el showroom, **sin margen de error** al recomendar o encontrar productos, que satisfaga siempre lo que el visitante quiere encontrar según sus peticiones y preferencias. Además, que quede como una base portable para la futura plataforma propia de tours virtuales (chatbot + wishlist + moodboard para cualquier temática, tamaño o estructura de datos).

## Flujo de sesiones

| Sesión | Qué hace | Entrada | Salida |
|---|---|---|---|
| **1** (este repo) | Obj. 1: análisis de la arquitectura actual. Prompt del Obj. 2. Captura de datos completos de las 88 piezas. | Código + tour + febalcasa.com | `01-…`, `02-prompt-…`, `casos-de-uso-…`, `datos-captura-estado.md`, `tour-project/febal-casa/product-facts/` |
| **2** (la corre Edd, sin repo) | Obj. 2: un arquitecto *clean-room* diseña desde cero | `02-prompt-arquitecto-clean-room.md` | `ARQUITECTURA_CLEAN_ROOM.md` → guardar como `02-arquitectura-clean-room.md` |
| **Datos** (este repo, en paralelo) | Continúa la captura de los 88 productos: listas oficiales completas, lectura manual de cada ficha, capturas del tour una por una y Excel para Andrea | `prompt-sesion-datos.md` | `tour-project/febal-casa/product-facts/*` + `progreso.json` + `coverage.json` |
| **1** (orquestadora) | Escribe los prompts, sigue el avance de las demás sesiones y revisa el resultado de la 2 | Los archivos de progreso | `03-prompt-sesion-3.md`, `datos-captura-estado.md` |
| **3** (este repo) | Obj. 3: comparar y decidir el refactor y el modelo. Obj. 4: implementar + pruebas UX. Obj. 5: iterar a error 0. Obj. 6: componentizar | Todo lo anterior + datos validados por Andrea | Código + suite automática + reportes |

## Decisiones ya tomadas por Edd (2026-09-22)
- **Variantes.** Se muestran **ambas, distinguiéndolas**: la pieza *en el showroom* (con "Llévame") y el modelo *bajo pedido* (las opciones oficiales de tapizado o acabado).
- **Presupuesto del LLM.** Calidad primero, costo moderado: ~US$0.02–0.05 por turno y menos de 8 s.
- **Datos.** Claude captura (febalcasa.com + capturas del tour) y **Andrea valida** con un Excel antes de que se usen.
- **Capturas del tour.** Por navegación API (el mismo mecanismo que "Llévame", sin mouse), solo donde la ficha oficial no dice qué acabado tiene la pieza. En las 57 fichas revisadas, ninguna lo dice.
- **Datos binarios (2026-09-23).** Cada atributo es SÍ (confirmado) o NO, con su fuente y su evidencia literal. Nada de niveles de confianza. Un sinónimo no confirma: la familia de color es una columna aparte, marcada como propuesta.
- **Método híbrido para las fichas (2026-09-23).** Un script solo transcribe literalmente las listas de acabados. Todo lo demás lo lee la sesión a mano, ficha por ficha, con el texto íntegro (WebFetch resume y trunca). Las capturas del tour las toma la sesión una por una, sin loops.

## Estado (2026-09-23)
- **Objetivo 1:** hecho (`01-…`).
- **Sesión de datos:** se relanza con `prompt-sesion-datos.md`. Parte de la pasada WebFetch (65/88), 27 capturas y el scraper probado en 5 de 56 fichas (con un bug de etiquetas conocido).
- **Sesión 2:** entregada (`02-arquitectura-clean-room.md`).
- **Objetivo 3:** propuesta lista en `03-decision-refactor.md`; la ejecutó la orquestadora a pedido de Edd. Espera su checkpoint (D1–D5). El avance se sigue en `progreso-sesion-3.md`.

## Índice
- [`01-analisis-arquitectura-actual.md`](01-analisis-arquitectura-actual.md): Objetivo 1. Por qué falla, por capa y con `archivo:línea`.
- [`02-prompt-arquitecto-clean-room.md`](02-prompt-arquitecto-clean-room.md): prompt listo para pegar en la sesión 2.
- [`casos-de-uso-y-criterios.md`](casos-de-uso-y-criterios.md): los 16 casos de uso, la definición medible de "error 0" y un borrador de conversaciones doradas.
- [`prompt-sesion-datos.md`](prompt-sesion-datos.md): prompt de la sesión de datos (continuación de la captura).
- [`03-prompt-sesion-3.md`](03-prompt-sesion-3.md): prompt de la sesión 3 (borrador; se revisa cuando vuelva la sesión 2).
- [`02-arquitectura-clean-room.md`](02-arquitectura-clean-room.md): resultado de la sesión 2.
- [`03-decision-refactor.md`](03-decision-refactor.md): Objetivo 3, la decisión de refactor y de modelo (propuesta pendiente del checkpoint).
- [`progreso-sesion-3.md`](progreso-sesion-3.md): avance de los Objetivos 3 a 6.
- `datos-captura-estado.md`: cobertura de la captura de datos (la escribe la orquestadora a partir de `product-facts/coverage.json`).
- `06-componentes.md`: lo genera el Objetivo 6.

## Reglas de trabajo en este repo
- Commits pequeños en inglés, al estilo de `git log --oneline`. **No hacer push** sin que Edd lo pida.
- Después de tocar datos o `scripts/build-febal-catalog.mjs`: regenerar el catálogo y el bundle (`node scripts/build-tour-bundle.mjs febal-casa`) y verificar con `npx tsc --noEmit` + `npm run build:core`.
- Los datos crudos de `tour-project/febal-casa/product-facts/` **no alimentan el runtime** hasta que Andrea los valide y la sesión 3 decida el esquema.
- Contexto histórico completo: [`../../HANDOFF_FEBAL_CASA.md`](../../HANDOFF_FEBAL_CASA.md).
