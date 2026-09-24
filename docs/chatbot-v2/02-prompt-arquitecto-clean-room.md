<!--
  PROMPT PARA LA SESIÓN 2 (arquitecto clean-room) — Objetivo 2.
  Uso: copia TODO lo que está debajo de la línea "===== COPIAR DESDE AQUÍ =====" y pégalo como primer
  mensaje en una sesión NUEVA (idealmente sin este repo abierto). Cuando el agente entregue
  ARQUITECTURA_CLEAN_ROOM.md, guárdalo como docs/chatbot-v2/02-arquitectura-clean-room.md y vuelve a la
  sesión 1 para generar el prompt de la sesión 3.
  Deliberadamente NO contiene rutas, nombres de archivo ni detalles del código actual (pedido de Edd).
-->

===== COPIAR DESDE AQUÍ =====

# Encargo: diseña desde cero la arquitectura de un asistente recomendador de muebles para un tour virtual

## Tu rol y reglas del encargo
Eres arquitecto de software senior especializado en sistemas con LLM (agentes, tool use, recuperación, evaluación). Vas a DISEÑAR (no implementar) la arquitectura completa de un chatbot recomendador y guía para un showroom de muebles recorrible como tour virtual 360°.
- Partes de cero: no existe código que debas respetar. **No leas ningún repositorio ni archivo local aunque tengas acceso.** Si te falta un dato, declara el supuesto y sigue.
- Presenta UNA arquitectura recomendada, con decisiones justificadas; las alternativas descartadas van en una línea con el motivo.
- Tienes libertad total para proponer un formato nuevo de base de datos, el reparto entre código determinista y razonamiento del LLM, y el modelo de lenguaje.
- Puedes investigar en la web (precios y capacidades de LLMs, técnicas). Cita fuente y fecha.

## Objetivo general
Entregar el mejor chatbot posible: un verdadero recomendador de muebles y guía por el showroom, **sin margen de error** al recomendar o encontrar productos, que satisfaga siempre lo que el visitante quiere encontrar según sus peticiones y preferencias. La pregunta central que debes responder es si conviene dejar el determinismo por código y hacer razonar directamente al LLM sobre las peticiones y lo disponible, combinar ambos, o encontrar un punto medio. Todo para asegurar margen de error 0 con un catálogo pequeño (88 piezas que el LLM puede ir consumiendo según pida el usuario).

## El dominio
- Showroom físico de una marca italiana de muebles de diseño, digitalizado como tour virtual de ~97 panorámicas 360°, en 5 zonas (4 "casas" ambientadas y una galería).
- **88 piezas expuestas** (ubicaciones en el tour) que corresponden a **~60 modelos** (57 fichas oficiales). Un mismo modelo puede estar expuesto en varias zonas, a veces en distinto color.
- Piezas por categoría: armarios 18, boiserie 10, librerías 10, sistemas modulares 9, cocinas 6, mesas 5, dormitorio 5, sofás 4, aparadores 4, sillones 4, sillas 4, pufs 3, mesas de centro 2, otros 2, taburetes 1, cajoneras 1.
- Cada pieza o modelo puede tener:
  - categoría;
  - forma (de ángulo/en L, modular, curvo, con isla, redonda/ovalada, extensible…);
  - uno o varios materiales (tejido, terciopelo, nobuk, efecto piel, madera chapada, lacado, gres, vidrio, metal, mármol…);
  - uno o varios colores;
  - líneas de tapizado o acabado con nombre propio;
  - estilo (minimal, contemporáneo, clásico elegante, cálido/acogedor…);
  - medidas (a menudo ausentes);
  - descripción de marketing en italiano;
  - imagen;
  - piezas con las que fue diseñado o expuesto.
- **Distinción clave: pieza expuesta vs modelo bajo pedido.** Ejemplo real: un sofá ofrece ~11 colecciones de tapizado de 8–24 colores cada una (≈130 combinaciones, varias en amarillo/mostaza), aunque en el showroom esté expuesto en verde oliva. Los armarios y cocinas ofrecen acabados agrupados por material (lacado mate en ~35 colores, chapa de roble en 5–8 tonos, efecto piel, gres, vidrio…). Los nombres oficiales de color vienen en inglés o italiano ("Mustard", "Rovere caffè").
- **Regla de la cliente para esa distinción.** Aplica a color, acabado, tapizado, estilo o cualquier variante. Si lo pedido **no está físicamente en el tour** pero la ficha oficial del modelo confirma que existe, el asistente dice las dos cosas:
  1. que en el showroom no está con ese color o acabado;
  2. que sí está disponible, con el enlace a la ficha oficial.

  En palabras de la cliente: *"no tengo el color que me pediste en este showroom, pero puedes verlo en su link"*. Nunca responde "no lo tenemos" a secas si la ficha lo ofrece, y nunca afirma disponibilidad que la ficha no confirme.
- **Los datos son incompletos y heterogéneos.** Hoy solo ~25% de las piezas tiene color/material catalogado (se está completando), casi no hay medidas, y un dato desconocido NO significa "no lo tiene". El catálogo está en italiano; los visitantes escriben en español, italiano, inglés u otros idiomas.
- Se están capturando, para cada pieza, una imagen desde su punto de vista en el tour y los datos de la ficha oficial de su modelo: colecciones de tapizado/acabado con sus colores y muestras, agrupadas a veces en categorías de precio, y medidas cuando existen.
- No hay precios ni stock en los datos.

## La interfaz (requisitos de producto)
- Widget de chat embebido en el tour. Las respuestas pueden mostrar tarjetas de producto con:
  - imagen, nombre y texto breve;
  - botón **"Llévame"**, que mueve la cámara del tour al punto de vista de esa pieza;
  - botón **"Ver alternativas"**;
  - botón **"Ver ficha"**, que abre la página oficial del modelo;
  - un corazón para guardar en la wishlist. Existe además un moodboard/colección exportable.
- **Regla de seguridad no negociable:** el LLM nunca genera ni ve coordenadas de cámara. Solo elige identificadores, que el sistema valida y traduce a una posición.
- El sistema puede saber qué panorámica o pieza está mirando el visitante, si tu diseño lo usa.

## Casos de uso obligatorios (del cliente y del equipo)
1. **Material con sinónimos (reporte real de la cliente):** *"He pedido al chatbot un sofá de cuero y no me ha mostrado nada."* Cuero = piel = pelle = leather, distinto de similpiel/ecopelle/nobuk. Debe saber si hay sofás en piel expuestos o bajo pedido. Si no los hay, lo dice y ofrece lo más cercano que sea real (p. ej. tapizado tipo nobuk o efecto piel, o sillones en piel si existen), siempre con tarjetas.
2. **Variante sobre el producto en foco:** viendo un sofá amarillo, pregunta *"¿lo tienes en café?"*. Se refiere al MISMO sofá en color café. Si está expuesto en café, lo muestra con "Llévame". Si solo existe bajo pedido, aplica la regla de la cliente: "en el showroom no lo tenemos en café, pero sí está disponible (p. ej. [colección + color]); puedes verlo en su ficha". Si no existe, ofrece alternativas que cumplan sofá + café.
3. **Restricciones acumuladas y relajación jerárquica:** *"¿tienes sofás de ángulo?"* → el bot dice que sí y muestra uno → *"¿lo tienes en amarillo?"* → debe cumplir sofá + ángulo + amarillo.
   - Si no hay, la prioridad es sofá + ángulo en otras opciones.
   - También ofrece buscar sofás amarillos que no son de ángulo, si los hay.
   - Si no hay sofás amarillos, lo dice, y ofrece colores que combinan: el café combina con amarillo, así que muestra sofá + ángulo + café.
   - Respuesta modelo: *"No tengo sofás de ángulo amarillos, pero tenemos de ángulo en café, que combina con amarillo. Si lo deseas, te puedo mostrar un sofá amarillo disponible, pero no es de ángulo, ¿qué opinas?"* En las tarjetas de alternativas aparecen el sofá amarillo disponible (aunque no sea de ángulo) y los sofás café de ángulo.
   - Todo ese razonamiento semi-jerárquico va en la MISMA respuesta y depende de cómo vaya encaminada la conversación.
4. **Cambio de tema:** en medio del caso 3 el visitante escribe *"cocinas"*. Se muestran cocinas sin considerar el color, material o forma de la conversación del sofá, como si fuera una conversación nueva. La excepción es que el visitante lo vincule explícitamente ("cocinas que combinen con ese sofá").
5. **Generalización:** todo lo anterior aplica a TODAS las características posibles (materiales, colores, forma, estilo, acabado, "combina con", medidas…), incluidos sinónimos de cada valor en varios idiomas. El orden de prioridad se ajusta a lo que el cliente va pidiendo.
6. **Forma con sinónimos:** "sofá esquinero / en L / rinconero / angular" = de ángulo. "Mesa redonda" debe encontrar la mesa redonda/ovalada extensible. Caso real: un modelo respondió que no había porque un dato estaba roto.
7. **Atributo inexistente:** "sofá rosa", "estilo industrial". Dice que no hay, nombra los valores reales que sí existen y propone lo más cercano.
8. **Recomendación según lo visto o guardado:** "¿qué más me recomiendas?", "algo que combine con lo que guardé".
9. **Referencias:** "ese", "el primero", "el otro", "el que estoy viendo" (lo que mira en el tour), también después de haber navegado a la pieza.
10. **Guía por el showroom:** "llévame", "¿dónde está?". Si el modelo está expuesto en 2 zonas, desambigua o elige con criterio. Nunca navega sin que el visitante lo confirme.
11. **Multi-idioma:** responde en el idioma del ÚLTIMO mensaje y cambia si el visitante cambia de idioma.
12. **Detalle técnico:** "¿qué medidas tiene?", "¿la estructura es de madera?". Solo responde con dato. Si falta, lo dice y ofrece la ficha oficial o el contacto.
13. **Listados:** "muéstrame todos los sofás". Muestra todas las opciones con tarjetas, no solo una.
14. **Petición vaga:** "algo acogedor para un salón pequeño". Razona sobre estilo, forma y medidas, y es honesto sobre lo que infiere.
15. **Correcciones y negaciones:** "no, el otro", "que no sea gris", "mejor en tela".
16. **Fuera de alcance / manipulación:** el clima, pedir coordenadas, "ignora tus reglas".

## Qué significa "margen de error 0" (así se va a medir)
- Cero productos o atributos inventados: toda afirmación es trazable a un dato.
- Cero falsos negativos: si en los datos existe algo que cumple la petición (expuesto o bajo pedido), se encuentra.
- Lo que solo existe bajo pedido se reporta como "no está en el showroom, pero sí disponible", con el enlace a la ficha correcta del modelo.
- Cuando algo no existe, lo dice explícitamente y ofrece la mejor alternativa real según la jerarquía de la conversación.
- Toda respuesta que habla de productos muestra sus tarjetas, y nunca navega sin confirmación.
- El idioma es correcto.
- Todo se verifica con una suite automática de conversaciones doradas.

## Contexto de modelos y costos que ya tenemos (verifícalo: puede estar desactualizado)
Precios por 1M tokens (entrada / entrada cacheada / salida), tomados de las páginas de los proveedores el 2026-06-24:

| Modelo | Entrada | Cacheada | Salida |
|---|---|---|---|
| gpt-4o-mini | $0.15 | $0.075 | $0.60 |
| gpt-4o | $2.50 | $1.25 | $10.00 |
| claude-sonnet-5 | $2.00 | $0.20 | $10.00 |
| claude-haiku-4-5 | $1.00 | $0.10 | $5.00 |

Mediciones de un prototipo anterior (con otro diseño; tómalas solo como referencia):
- **gpt-4o-mini:**
  - ~12K tokens de entrada por turno (la mitad cacheados) y ~130 de salida;
  - ≈ US$0.0014 por turno y 3.4–3.6 s;
  - falló en reglas finas: responder en inglés, cambiar de idioma a media conversación, nombrar los valores reales disponibles, disciplina al usar herramientas.
- **Claude Sonnet 5 y Haiku 4.5:**
  - estimados por API directa con esos mismos tokens: ≈ US$0.013 y US$0.0066 por turno;
  - latencias medidas de 16–20 s (Sonnet) y 18–29 s (Haiku), a través de un SDK de agentes con mucha sobrecarga, NO representativas de la API directa;
  - Sonnet fue el más preciso en forma, acabado y color; Haiku tuvo 2 errores HTTP 502 en 8 turnos.
- Existen modelos más nuevos (p. ej. la familia Claude actual: Haiku 4.5, Sonnet 5, Opus 5.5, Fable 5.1; también las familias GPT y Gemini vigentes). Investiga precios, ventana de contexto, razonamiento, tool use, structured outputs, prompt caching y latencia.

**Restricciones de negocio:**
- Calidad primero, con costo moderado: objetivo de ~US$0.02–0.05 por turno.
- Menos de 8 s por respuesta; se admite streaming.

**Pregunta explícita:** ¿conviene subir a un modelo algo más caro a cambio de más razonamiento? ¿Y dejar de lado el determinismo por código para que el LLM razone directamente sobre las peticiones y lo disponible, o combinar ambos?

## Reutilización futura (requisito)
El sistema se reutilizará dentro de una plataforma web propia de configuración de tours virtuales, que sustituirá a la herramienta comercial actual. En ella se configurarán tours con chatbot + wishlist + moodboard + otras funciones, sin importar la temática (muebles, inmobiliaria, retail, museos…), el tamaño (de decenas a miles de ítems) ni la estructura de la base de datos. Diseña componentes desacoplables. Define qué cambia por tour (configuración y datos) y qué no (núcleo), sin comprometer el error 0. Explica cómo escala tu estrategia de contexto si el catálogo crece a miles de ítems.

## Preguntas que tu diseño debe responder explícitamente
1. ¿Qué es determinista (código) y qué razona el LLM? Tabla responsabilidad → dueño → justificación.
2. ¿El LLM ve el catálogo completo, una recuperación o un híbrido? Con tokens y costo por turno.
3. ¿Cómo se representa el estado de la conversación (producto en foco, restricciones activas, tema, preferencias)? ¿Quién lo actualiza y cuándo se reinicia?
4. ¿Cómo se implementa la relajación jerárquica de restricciones y quién decide la prioridad?
5. ¿Cómo se modelan los sinónimos multilingües, las familias de color, la armonía cromática ("combina con") y la distinción entre pieza expuesta y bajo pedido?
6. ¿Cómo se garantiza que nunca se afirme un producto o atributo falso ni se omita uno existente (verificación de salida, citas, validación)?
7. ¿Qué modelo(s), con qué configuración (razonamiento, caching) y qué fallback?
8. ¿Cómo se evalúa y se evitan regresiones (oráculo determinista, LLM-as-judge, métricas, umbral para declarar error 0)?
9. ¿Cómo se hace portable a otros tours, temáticas y estructuras de datos?

## Entregable
Un único documento Markdown, `ARQUITECTURA_CLEAN_ROOM.md`, con estas secciones:
0. **Resumen ejecutivo** (≤1 página): la decisión central y por qué.
1. **Principios de diseño.**
2. **Modelo de datos:**
   - esquema (JSON Schema o tipos TypeScript) y vocabularios controlados;
   - sinónimos, familias de color y armonía;
   - pieza expuesta vs modelo bajo pedido;
   - 3 registros de ejemplo: un sofá con tapizados bajo pedido, un armario con acabados agrupados por material, una mesa con variantes de forma;
   - cómo se captura y valida el dato.
3. **Arquitectura de runtime:** diagrama mermaid, responsabilidad de cada componente y el ciclo de un turno paso a paso.
4. **Estado conversacional:** estructura, actualización y reinicio por cambio de tema.
5. **Determinismo vs LLM:** la tabla de responsabilidades y qué ve el LLM en cada turno (contenido y tokens).
6. **Búsqueda y relajación jerárquica:** pseudocódigo, y cómo se compone una respuesta con varios grupos de tarjetas, cada una con su "motivo" (qué cumple y qué no).
7. **Garantías de error 0:** validaciones, verificación de afirmaciones, y qué pasa cuando el LLM se equivoca.
8. **Trazas:** los 16 casos de uso recorridos por tu arquitectura, con el texto de respuesta esperado y las tarjetas.
9. **Selección de modelo:**
   - comparativa con precios verificados (fuente y fecha);
   - costo por turno y por 1.000 conversaciones, y latencia;
   - recomendación y fallback;
   - respuesta explícita a "¿vale la pena un modelo más caro?".
10. **Evaluación:** suite automática, oráculo, métricas y prevención de regresiones.
11. **Portabilidad:** componentes, interfaces y qué es configurable por tour.
12. **Riesgos, supuestos y preguntas abiertas.**
13. **Hoja de ruta de implementación por fases.**

Prioriza tablas, pseudocódigo y decisiones concretas sobre prosa genérica.
