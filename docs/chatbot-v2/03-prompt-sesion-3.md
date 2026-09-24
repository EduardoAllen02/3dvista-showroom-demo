<!--
  PROMPT PARA LA SESIÓN 3 (Objetivos 3 a 6) — Chatbot Febal v2.
  Precondición: docs/chatbot-v2/02-arquitectura-clean-room.md existe (el resultado de la sesión 2 guardado ahí).
  Uso: sesión NUEVA de Claude Code en este repo, idealmente con Opus y en modo plan. Primer mensaje:
      Lee docs/chatbot-v2/03-prompt-sesion-3.md (desde "COPIAR DESDE AQUÍ") y ejecútalo.
  Borrador escrito por la orquestadora el 2026-09-23; se revisa cuando vuelva el resultado de la sesión 2.
-->

===== COPIAR DESDE AQUÍ =====

# Sesión 3: Chatbot Febal v2, Objetivos 3 a 6

## Objetivo general (no cambia)
Entregar el mejor chatbot posible: un verdadero recomendador de muebles y guía por el showroom de Febal Casa (tour virtual 3DVista), **sin margen de error** al recomendar o encontrar productos. Además, que quede como una base portable para la futura plataforma propia de tours virtuales (chatbot + wishlist + moodboard para cualquier temática, tamaño o estructura de datos).

## Precondición
Si `docs/chatbot-v2/02-arquitectura-clean-room.md` no existe, **detente** y díselo a Edd. Sin ese documento no hay Objetivo 3.

## Lee primero, en este orden
1. `docs/chatbot-v2/README.md`: flujo de sesiones y decisiones ya tomadas por Edd.
2. `docs/chatbot-v2/casos-de-uso-y-criterios.md`: los 16 casos de uso, la definición medible de "error 0" y el borrador de conversaciones doradas. **Es tu contrato.**
3. `docs/chatbot-v2/01-analisis-arquitectura-actual.md`: el Objetivo 1, con por qué falla hoy, capa por capa y con `archivo:línea`. Verifica esas referencias antes de apoyarte en ellas: el código pudo moverse.
4. `docs/chatbot-v2/02-arquitectura-clean-room.md`: el Objetivo 2, diseñado desde cero por un agente que no vio el código.
5. El estado de los datos: `tour-project/febal-casa/product-facts/coverage.json` y `progreso.json` (si ya existen), más `docs/chatbot-v2/datos-captura-estado.md`.
6. `HANDOFF_FEBAL_CASA.md`: el histórico. Léelo por encima; úsalo como referencia, no como plan.

## Con quién convives (importante)
- **Edd** decide. Hay un **checkpoint obligatorio con él al final de cada objetivo** y cuando una decisión cambie el alcance.
- **La sesión orquestadora** sigue tu avance leyendo `docs/chatbot-v2/progreso-sesion-3.md`. Mantenlo corto y al día, con esta forma:
  - objetivo actual;
  - lo hecho (con hashes de commit);
  - lo siguiente;
  - bloqueos;
  - métricas de la suite.

  Si la sesión se corta, otra debe poder continuar desde ese archivo más `git log`.
- **Una sesión de datos puede estar corriendo en paralelo** en este mismo repo:
  - Escribe en `tour-project/febal-casa/product-facts/**` y en scripts `*facts*` / `cdp*`, y usa el Chrome de Edd por CDP (puerto 9222) con el tour en `localhost:5501`.
  - **No toques esos archivos**, no uses ese Chrome ni ese puerto, y no reinicies el servidor del tour sin preguntar.
  - Para probar la UX usa el navegador integrado u otro puerto.
- **Andrea** (la cliente) valida los datos con un Excel que le manda Edd. **Solo `product-facts/*.reviewed.json` cuenta como verdad** para el oráculo y para declarar error 0.
  - Mientras no exista, desarrolla contra los datos crudos de `product-facts/`, marcados como no validados.
  - El pipeline debe poder cambiar a los `.reviewed.json` sin tocar código.

## Objetivo 3. Comparar y decidir (solo lectura; trabájalo en modo plan)
1. **Matriz de decisión**, componente por componente: modelo de datos, recuperación, estado conversacional, relajación jerárquica, contrato de tools y prompt, orquestación y respuesta con varios grupos de tarjetas, verificación de salida, modelo LLM, evaluación, portabilidad. Para cada uno:
   - lo actual, con su referencia de código;
   - lo que propone la clean-room;
   - decisión: **mantener / adoptar / adaptar / descartar**;
   - costo, riesgo y casos de uso que desbloquea.
2. **Cobertura de casos de uso:** qué UC resuelve cada arquitectura y cuáles quedan sin resolver aun con la elegida.
3. **Alcance del refactor:** parcial o total, y cómo migrar sin romper lo que hoy funciona (mesa redonda, navegación "Llévame", wishlist).
4. **Modelo LLM:**
   - Precios verificados hoy, citando fuente y fecha. Para modelos Claude usa la skill `claude-api`.
   - Mide la latencia **por API directa**, no por el Agent SDK: las cifras viejas de 16–29 s estaban infladas por él. Hazlo con un prompt representativo y pocas llamadas, y reporta el gasto.
   - Presupuesto de Edd: ~US$0.02–0.05 por turno y menos de 8 s (se admite streaming). Calidad primero.
5. **Esquema de datos** y cómo se mapea desde `product-facts/` (modelo bajo pedido vs pieza expuesta, sinónimos multilingües, familias de color, armonía cromática).

**Entregable:** el plan que presentes para aprobación. Al aprobarlo, lo primero que haces es guardarlo como `docs/chatbot-v2/03-decision-refactor.md`. **CHECKPOINT con Edd.**

## Objetivo 4. Implementar en Febal + pruebas de UX
0. **Git, antes de tocar código.** El working tree tiene un diff grande sin commitear, y hay fuentes del runtime *sin trackear* (`packages/catalog-engine/src/{matching,similarity,variants,color-families}.ts`, `packages/model-adapters/src/anthropic-adapter.ts`, `server/src/agent/claude-code-*.ts`, entre otras).
   1. Propón a Edd un **commit baseline** de ese WIP: una lista explícita de qué entra y qué se queda fuera (`.scratch/`, `fase2-*`, resultados de pruebas, `deploy-febal-casa/`, `tour-project/febal-casa/product-facts/`…).
   2. Luego crea la rama `chatbot-v2`.
   3. **Nada de esto sin su OK.**
1. Commits pequeños en inglés, al estilo de `git log --oneline`. **Sin push.** Stagea rutas explícitas, **nunca `git add -A` ni `git add .`**, porque la sesión de datos escribe en el mismo árbol.
2. Sigue las fases de `03-decision-refactor.md`.
   - Empieza por una **rebanada vertical** que resuelva de punta a punta **UC-1** ("sofá de cuero"), **UC-2** ("¿lo tienes en café?") y **UC-3** ("ángulo + amarillo" con relajación jerárquica y varios grupos de tarjetas).
   - La rebanada debe cumplir ya la **regla de disponibilidad de Andrea** (criterio E10 de `casos-de-uso-y-criterios.md`): "no está en el showroom con ese color o acabado, pero sí disponible; puedes verlo en su ficha", con el botón "Ver ficha" de la tarjeta apuntando a la ficha correcta del modelo.
   - **CHECKPOINT con Edd** cuando esa rebanada funcione.
3. Después de tocar datos, el build del catálogo o el widget:
   1. regenera el catálogo y el bundle (`node scripts/build-tour-bundle.mjs febal-casa`);
   2. verifica con `npx tsc --noEmit` y `npm run build:core`.
4. **Suite automática de conversaciones doradas** (Objetivo 4b), construida a partir de `casos-de-uso-y-criterios.md`:
   - **Oráculo determinista:** ids de tarjetas esperados o prohibidos, afirmaciones trazables a datos, idioma, "no navega sin confirmación".
   - Un LLM-juez solo donde el oráculo no alcanza (tono, naturalidad), y con sus límites declarados.
   - Se corre con un comando y reporta costo y latencia por turno.
5. **Pruebas de UX en vivo** en el tour real, a través del widget:
   - cámara solo por "Llévame" y **nunca arrastres el mouse**;
   - capturas como evidencia;
   - los hallazgos van a `progreso-sesion-3.md`.
6. **Reglas de seguridad que se mantienen:**
   - el LLM nunca genera ni ve coordenadas de cámara;
   - toda afirmación sobre un producto sale de los datos, y "disponible bajo pedido" solo se dice si la ficha oficial lo lista;
   - nunca navega sin la confirmación del visitante.

## Objetivo 5. Iterar hasta error 0
- **Umbral para declarar error 0:**
  - el 100 % de las conversaciones doradas pasan en **3 corridas consecutivas** (para cubrir el no-determinismo del LLM), **con los datos `.reviewed.json`**;
  - y una sesión de UX en vivo con Edd sin fallos.
- **Cada iteración** deja en `progreso-sesion-3.md`: cuántas pasan y cuántas fallan, la causa raíz de cada fallo (datos / recuperación / estado / prompt / modelo) y el fix con su commit.
- Si un fallo se debe a un dato faltante o incorrecto, **no lo parches en código**. Repórtalo como pregunta para Andrea, a través de Edd.
- **CHECKPOINT con Edd** al llegar al umbral.

## Objetivo 6. Componentizar para la plataforma de tours
- Separar un **núcleo** de lo que es **configuración y datos por tour**, sin cambiar el comportamiento. La prueba es que **la misma suite sigue en verde**.
- **Interfaces mínimas:**
  - fuente de catálogo con su esquema mapeable (otra temática, otro tamaño, otra estructura);
  - puente con el motor del tour (3DVista hoy, la plataforma propia mañana);
  - proveedor LLM;
  - vocabularios (sinónimos, familias, armonía) por dominio;
  - i18n de los textos de la UI.
- Estrategia de contexto si el catálogo crece a miles de ítems.
- **Entregable:** `docs/chatbot-v2/06-componentes.md` (qué es núcleo, qué se configura por tour y cómo se da de alta un tour nuevo). **CHECKPOINT final con Edd.**

## Restricciones generales
- No hacer push ni desplegar (EC2, etc.) sin que Edd lo pida.
- No enviar nada a Andrea: los envíos los hace Edd.
- Las pruebas contra APIs pagadas deben ser acotadas; reporta el gasto acumulado en `progreso-sesion-3.md`.
- Si algo del plan resulta imposible o innecesario, dilo en el checkpoint en lugar de forzarlo.
