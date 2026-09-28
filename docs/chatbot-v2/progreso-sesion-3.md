# Progreso de la sesión 3 (Objetivos 3 a 6)

> Lo ejecuta la sesión orquestadora a pedido de Edd.
> Última actualización: 2026-09-25.

## Decisiones de Edd (checkpoint Obj. 3)
- **D1.** Refactor aprobado ("dale, el caso es que funcione").
- **D2.** Modelo: **nada de Sonnet**. Se trabaja con el GPT actual (gpt-4o-mini) y luego se compara con GPT baratos (gpt-6-luna, gpt-5-mini, gpt-5-nano). gpt-4o "normal" queda descartado porque cuesta más que Sonnet.
- **D3.** Umbral de error 0: queda el propuesto por defecto (pass^5 con datos revisados por Andrea + UX en vivo).
- **D4.** "Llévame a X" con destino único navega directo. Es configurable.
- **D6.** (2026-09-25) Regla de confianza: un hecho con fuente literal (ficha oficial o captura del tour) vale sin firma. La revisión solo corrige excepciones. Revisar a mano miles de filas no es viable: lo que las fuentes no resuelven va a una hoja corta con valor por defecto.
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

### Revisión automática (2026-09-25)
- **Regla de confianza** en `compile.ts`: en modo estricto se usan los hechos `official_page` y `tour_capture` pendientes; los de la v1 siguen necesitando validación. G7: 818/818.
- **Paletas de línea decididas por modelo** leyendo las 18 fichas → `product-facts/palette-decisions.json` (aplica / aviso / no_aplica, con cita).
  - aplica → opción normal bajo pedido; aviso → nivel "de la línea" con su advertencia; no_aplica → no se menciona.
  - Los acabados interiores (FINITURE CASSA INTERNA) nunca son "aplica", para no ofrecer un color interior como color de las puertas.
  - Resultado: 61 colecciones como opción del modelo, 76 con aviso, 133 no se mencionan.
  - Ejemplos: Couple ofrece laca, chapa, metal skin, telas y similpiel, pero no espejo ni gres; Arden, nada.
  - La revisión (promoted/excluded) sigue mandando sobre la lectura.
- **Colores.** Las 5 "dudas" (Khaki, Moss, Pale, Platin, Vanilla Ice) eran el mismo nombre en telas distintas, cada una con su muestra. El clasificador tenía un hueco: los oliva y crema desaturados caían en rojo o rosa. Corregido (Moss → verde, Vanilla Ice → crema).
- **Materiales.**
  - «Supporti a lama» → metal (la misma ficha: «PIEDI IN METALLO»).
  - El léxico acepta las formas femeninas italianas (nobilitate, laccate opache).
  - Lo que queda sin material no es duda: «Forma» es una lista de formas y «Anta Libeskind» viene vacía.
- **Hoja corta**: `scripts/build-decisions-xlsx.py` → `~/Downloads/febal-casa-decisiones-2026-09-25.xlsx`, con 16 decisiones (15 en la v2).
  - 7 piezas con foto (FEB-010, 031, 035, 037, 077, 085, 099).
  - 9 preguntas, incluida la lista de acabados del showroom.
  - Cada fila dice qué pasa si queda vacía.
  - Cerradas sin persona: P11 (la ficha dice «effetto pelle»), P12 (Couple leída), P13 (sin lista → enlace a la ficha), P18 (la captura muestra Marlene) y P23 (las capturas reemplazan la v1).
- FEB-010 Diciotto: su punto de vista apuntaba a las vitrinas de Trenta (las dos capturas eran de la misma pared).
  - Diciotto es la pared de la TV y Trenta la de vitrinas con el paso al centro. Lo confirman las fichas: «pareti attrezzate» y «vano ponte / Anta Aurora».
  - Nuevo POV, el que dejó puesto Edd en el tour: panorámica 20, yaw -67.2, pitch -11.5, fov 130. Se recapturó (llega igual desde otra panorámica) y se re-observó. La duda se cerró, así que la hoja corta queda en 15 decisiones (`febal-casa-decisiones-2026-09-25-v2.xlsx`).
  - Trenta tiene una vista frontal mejor en la panorámica 19 (yaw 17, pitch 2, fov 88). Se queda en la 18 hasta arreglar "Llévame" dentro de una misma panorámica.
- Respuestas a la hoja corta (2026-09-26):
  - FEB-031: la ficha «Sistema Origina · Anta Libeskind» es correcta. Es la composición de cocina completa: la isla Libeskind022 (FEB-030) más las columnas de «ante rientranti» con hornos y cava.
  - FEB-035: la pregunta ahora es concreta: ¿el top es Gres Travertino Silver Bocciardato o Scenario Travertino, y se puede pedir así?
  - La hoja queda en 14 decisiones: `febal-casa-decisiones-2026-09-26.xlsx`.
- **Dos Excel vivos en Descargas, con nombre fijo** (2026-09-26):
  - `febal-casa-decisiones.xlsx`: lo que falta decidir. Hoy son 5 piezas y 9 preguntas.
  - `febal-casa-base-de-datos.xlsx`: todos los datos del asistente, con Léeme (es) y Leggimi (it), sin columnas de OK ni preguntas.
    - 12 hojas: piezas con foto, modelos, opciones que ofrece, paletas por modelo, acabados de paletas, sinónimos, colores → familia, materiales, estilos, armonías, ánimos y correcciones.
    - Las columnas ✎ (encabezado verde) se editan.
  - Ida y vuelta:
    - `python scripts/import-database-xlsx.py <archivo>` muestra los cambios y valida los valores;
    - con `--apply` los escribe, reconstruye el catálogo estricto, corre las pruebas y regenera el Excel.
  - Dónde se guardan las ediciones:
    - `palette-decisions.json`, `color-overrides.json`, `material-overrides.json` y `placements.json` (vía facts-placement);
    - `clients/febal-casa/ontology.overrides.json` (sinónimos, armonías, ánimos), que el motor aplica con `scripts/load-pack.ts`.
  - Una sola definición de hojas (`scripts/febal_database.py`) la comparten el generador y el importador.
  - Probado:
    - importar el archivo sin tocar da 0 cambios;
    - 6 ediciones de prueba llegaron al catálogo y al diccionario, y se revirtieron;
    - un valor inválido frena todo;
    - un cambio en una columna de consulta se reporta y no se importa.
  - `build-review-xlsx.py` e `import-review-xlsx.py` quedaron reemplazados. Los Excel anteriores están en `Descargas/febal-casa-versiones-anteriores/`.
- **Revisión fila por fila de la base de datos** (2026-09-27): modelos, piezas, 533 colores, 114 colecciones, 3.112 opciones, 110 conceptos, armonías y ánimos.
  - **Mecánica nueva:**
    - frases que no son concepto (`stop_phrases` del paquete: "anta square", "schienali scorrevoli", "maniglie a ponte", "tv girevole", "gambe lineari", "portale tv"…);
    - forma según el tipo de mueble ("penisola" en cocina = península; "a isola" fuera de cocina = al centro de la habitación);
    - una pieza cuya foto dice "cucina" es cocina;
    - las columnas «lo que entiende el asistente» se editan en el Excel (`concept-overrides.json`, fuente "curated").
  - **Formas:**
    - se quitaron falsas en Navigli, 3 cocinas "square", Origina telaio legno, Madeira, Trenta, Dea, Boiserie y la cocina Libeskind (chaise → península);
    - se agregó "curvo" en Nives, Arden, Camden y Marlene;
    - FEB-098 pasó de isla a centro de la habitación.
  - **Materiales:**
    - "lucido/opaco/mate/brillante" sueltos ya no son lacado (Madeira, Phoenix, PET, vidrio, chapa);
    - "nobilitato Noce/Leather grey" es melamina, no nogal ni piel;
    - concepto nuevo "efecto madera" (Profile Solid, FEB-086);
    - "metalskin" y "lignea" se reconocen;
    - FEB-065 y FEB-076 son vidrio con efecto metal (ficha);
    - en listas del texto, un color ya no cambia el material (latón).
  - **Categorías:** FEB-029 e Ink → mesa de centro (su ficha: "coffee table"); Astrid → grupo de noche; FEB-021 → cocina.
  - **Colores (24 nombres):**
    - Castano/Cacao/Braun → café; Smeraldo/Mint/Irish Mint → verde; Jeans → azul; Lilac/Pureple → morado;
    - Extrawhite/Snowwhite/Ottico → blanco; Greystone/Basalto/Stopsol → gris; Melon → naranja; Vetro trasparente → transparente;
    - maderas (Acacia, Ilice Wood, Rovere asiatico) → madera natural;
    - "Grigio Antracite" también es antracita; "Oro Rosa" también es dorado; "grigio perla" solo gris.
  - **Etiquetas:**
    - 116 limpiadas (prefijo Nobilitato1/2, "(1)/(2)", Rovere asiatico, gres lucido/opaco);
    - 20 opciones repetidas o vacías quitadas (5.138 → 5.118).
  - **Vocabulario:** fuera "abatible" (extensible) y "fino a terra" (de piso a techo).
  - Motor ≡ oráculo en 23.045 combinaciones. Batería run10: los 24 turnos con el mismo resultado que run9, 0 plantillas.
  - **Dudas resueltas con Edd:**
    - **Paredes Sistema Origina:** se revisó la foto de cada una. FEB-008, 009, 020, 031, 068 y 077 tienen hornos, copas o tarja, así que son cocina; ninguna está en la sala.
    - **Mármol y piedra:**
      - conceptos nuevos "efecto mármol" (supermarmo, Scenario) y "piedra natural", separados de mármol y efecto piedra (cercanía 0,2);
      - si piden mármol, primero va el real (hoy no hay ninguno) y luego el efecto, aclarando que es efecto;
      - el motor ya no excluye de las alternativas las piezas "sin confirmar" que no mostró (antes faltaban Madeira y Daniel).
    - **Estilo:** "clásico" y "elegante" son dos estilos. Quedan 5 modelos clásicos y 28 elegantes.
    - **"Osso" era "Rosso":** la web le quita la "R" (su muestra es `…_pet_rosso.jpg`). El limpiador de etiquetas la restaura con el nombre del archivo.
  - **Arreglos que salieron de las pruebas:**
    - "vinculado" a la misma pieza que se pide en variante pasa a "continúa" (antes Arden en azul terminaba en plantilla);
    - la lista agrupa por modelo y aspecto (una sola cocina Origina cannettato, un solo Dea).
  - Batería run12: 26 turnos (con C16 mármol/clásico), 0 plantillas, 4 reparaciones, $0.00081/turno. Motor ≡ oráculo en 23.828 combinaciones.
- **Estilos probados como cliente** (2026-09-27, `v2-chat.mts --ask "…"` para preguntas sueltas):
  - el reductor recupera el estilo que el planificador olvida ("sofá clásico" ya no lista todos los sofás ni dice "clásicos" sin serlo), salvo si la palabra también es un ánimo ("acogedor" sigue siendo una preferencia);
  - un estilo que tiene ≥30 % del showroom pedido solo ("algo elegante") → se pregunta el tipo de mueble; "sofás" después afina la búsqueda en vez de abrir otra;
  - "algo verde" que el planificador llama charla o recomendación se trata como búsqueda;
  - "mesa de comedor" es su propia categoría (hija de mesa), así que ya no trae mesas de centro; "mesa" trae las dos;
  - "sala" = sofá (uso de México);
  - idioma: palabras que solo existen en uno ("armario", "armadio"…) desempatan ("un armario elegante" ya responde en español).
  - Batería run14: 26 turnos, 0 plantillas, $0.00084/turno; frente a run12 solo cambió "algo clásico para la sala" (ahora Balmoral y Camden). Motor ≡ oráculo en 25.015 combinaciones.
- **Hoja de decisiones resuelta en el tour** (2026-09-27):
  - **FEB-077:** su zona es Casa 4; el letrero de las panorámicas 78 y 79 dice "CASA 01" y hay que corregirlo en 3DVista (PENDIENTE).
  - **FEB-099:** es Barret battente con portal (sin rieles, jaladeras de barra).
  - **FEB-085:** es la cocina completa: la cocina escondida tras "ante rientranti" más la isla con mesa redonda, con el mismo marcador 621. Su POV nuevo abre la vista con las puertas abiertas (82-opening, encuadrado por Edd).
  - **FEB-037:** es Momenti, no lavandería (url-overrides, models.json, catalog.json); FEB-056 también apunta ya a la ficha de Marlene en el widget.
  - **Chaise / penisola:** es un tipo de sofá de ángulo (decisión de Edd). "En L" y "esquinero" traen Balmoral, Melrose y Navigli; "con chaise" trae Melrose y Navigli.
  - **Idioma:** pistas nuevas ("sofá", "sala", "hay", "qué"…).
  - **Queda para Andrea:** FEB-035 travertino, la lista de acabados del showroom y Nabuk, más las 71 relaciones y 4 ánimos que revisa con Edd.
- **Preguntas 4–7 aprobadas por Edd y probadas como cliente** (2026-09-27):
  - **Tarjetas:** 8 por respuesta, 12 en un listado. El texto nombra como mucho 4 piezas del showroom y da el total con {{n}}; bajo pedido nombra 2 junto a piezas del showroom, 3 si no hay (el resto va en las tarjetas). Con 3 o más, cada una lleva 2 acabados en el texto.
  - **Otro idioma (fr/de/pt):**
    - el mensaje se traduce primero al inglés con una llamada corta y todo el turno trabaja sobre esa traducción ("graue Sofas" → gris, "cozinha branca" → cocina blanca);
    - responde en inglés y ofrece los tres idiomas una sola vez.
  - **"Nada negro":** se reinicia al cambiar de tipo de mueble (silla → mesas: salen las 7).
  - **Falta un dato o preguntan precio:** enlace a la ficha oficial (tiene el botón de cita). Sin pieza en foco, se explica que no hay precios y se pregunta qué mueble le interesa. Los detalles se dicen en el idioma del cliente con el texto de la ficha entre comillas.
  - **Arreglos que salieron de estas pruebas:**
    - "Lo que sí tenemos es: …" ya no se agrega cuando ya se ofreció un sustituto (efecto mármol, nobuk, café que combina);
    - al decir "sí" a una oferta se conserva cómo calificaba la pieza (Couple en azul bajo pedido, con enlace), no solo cuál era;
    - "su ficha" siempre lleva enlace;
    - la oferta final puede llevar una frase corta después de la pregunta, y solo queda una pregunta, al final;
    - los enlaces que completa el código van antes de la pregunta final y con el nombre del modelo;
    - colores del showroom en inglés en orden natural ("light olive green", no "green olive light");
    - "Boiserie (Boiserie)" y "gris cálido (gris cálido)" ya no se repiten;
    - cantidades con letras solo si son el total real;
    - verificador: los `\b` de "Casa N" (V4/V8) eran caracteres de retroceso desde el primer commit, así que esas dos reglas nunca reconocían "Casa 01". Ya están corregidos.
  - `V2_DEBUG=1` en `v2-chat.mts` imprime cada borrador del redactor (`=2` también lo que recibió).
  - Batería run17: 26 turnos, 0 plantillas, 4 reparaciones, $0.00084/turno, p95 3,6 s. Motor ≡ oráculo en 25.015 combinaciones.
- **v2 conectado al tour** (2026-09-27):
  - **Servidor:**
    - `ASSISTANT_ENGINE=v2` (por omisión `v1`) hace que `/chat` use `server/src/v2/turn-v2.ts`;
    - el motor se arma una vez con `catalog.v2.json` y las ediciones del cliente;
    - cada turno queda con su traza en `server/data/v2-turns.jsonl`;
    - "Ver alternativas" (la ruta del v1) se oculta en v2.
  - **Widget:**
    - manda la panorámica y la cámara; el servidor calcula qué piezas están a la vista y cuál al centro ("¿este lo tienen en azul?" → la pieza que mira). El LLM solo ve IDs;
    - tarjetas con encabezado de grupo ("En el showroom", "Disponible bajo pedido"), motivos como etiquetas y enlace "Sito ufficiale ↗".
  - **"Llévame" en la misma panorámica:** usa `setPosition` (antes `set()` no repintaba la vista). Si el modelo pedido tiene una pieza a la vista, lleva a esa (Trenta en Casa 3 y no en Casa 1).
  - **Fotos de tarjeta:**
    - 37 de 88 salían con marcador de posición, Navigli mostraba cajones de cocina y FEB-037 apuntaba a la lavandería;
    - las 39 usan ahora la captura limpia del tour recortada sin letreros (`clients/febal-casa/assets/products/tour/`);
    - `build-febal-catalog.mjs` hace lo mismo si se regenera.
  - Probado en el tour por CDP: Melrose (otra panorámica), "este en azul" → Melrose, Trenta en la misma panorámica, cocinas con foto.
- **v2 por omisión** (decisión de Edd, 2026-09-27):
  - `ASSISTANT_ENGINE` vale `v2` si no se indica; `v1` queda solo como respaldo.
  - **"Ver alternativas":** manda un turno de chat marcado con la pieza ("Alternativas a Divano Melrose"). El v2 lo resuelve sin planificador, con el motor de alternativas. Las tarjetas dicen qué comparten ("mismo material · misma forma · mismo estilo") y el redactor sabe de qué pieza son alternativas.
  - **Idioma del widget:** botones, placeholder, sugerencias, encabezado y avisos siguen el idioma de la conversación (italiano al inicio; cambian con `lang` de la respuesta). La capa "La mia collezione" sigue el idioma del tour.
  - Batería run18: 26 turnos, 0 plantillas, 3 reparaciones, $0.00091/turno, p95 3,5 s.
- **Portabilidad, fases 1, 2 y 5** (2026-09-27). Método: una foto determinista del comportamiento (`scripts/v2-snapshot.mts`, 45 turnos sin LLM + los dos prompts) que debe salir idéntica después de cada fase, más el oráculo y la comparación del catálogo reconstruido.
  - **Fase 1, el dominio fuera del núcleo:**
    - el vocabulario es un archivo de datos (`packages/assistant-engine/src/packs/furniture.json`);
    - lleva además las reglas de dominio: qué combina con qué, dónde buscar un ambiente, qué parte viste cada opción, formas según el mueble y ejemplos de sinónimos para el planificador;
    - lo específico de la fuente Febal (nombrado de colores de sus fichas, categorías en italiano, nombres a mano, títulos "Piedi/Frontali") pasó a `src/adapters/febal/`;
    - el motor ya no tiene ninguna categoría de mueble escrita en código.
  - **Fase 2, el tono por tour:** `clients/<tour>/assistant.json` define:
    - quién es el asistente y dónde está (prompts);
    - la marca y el formato de las zonas ("CASA 03 - AUDACE" → "Casa 3 (Audace)");
    - los nombres de las líneas;
    - los ejemplos del redactor;
    - cualquier texto o etiqueta a reemplazar por clave.

    Probado con un perfil de museo: cambia el tono y los textos, y en los prompts no queda nada de Febal.
  - **Fase 5, el puente del visor:** `ViewerBridge` = navegar, abrir panel, `getViewer()` (panorámica y cámara) y `hotspots` (bajo el puntero, posición, panel nativo, clave de un producto).
    - 3DVista es una implementación (`createTourBridge`);
    - el chat y la wishlist ya no llaman a 3DVista directo;
    - el widget usa un solo puente, el que la plataforma anfitriona pase en `init({ bridge })` o el de 3DVista.

    Probado en un tour aparte (5502 + backend 8962): Llévame, "este", Trenta en la misma panorámica, Ver alternativas y overlay de la wishlist, sin errores.
  - **Arreglo:** si el redactor escribe la etiqueta y el nombre, ya no sale "Balmoral Balmoral".
  - **Pendiente para el mood board:** las recomendaciones de la wishlist todavía usan la ruta `/recommendations` del v1.
- FEB-094 (silla Dea) reencuadrada en el tour: yaw 117.7, pitch -44.4, fov 75.2. Llega al widget de producción con el próximo deploy.
- **Pendiente:** acabados exactos y materiales de las piezas.
  - Con la lista del showroom se completan solos.
  - Si no existe, se hace una pasada por foto que marca SÍ solo cuando se ve sin duda.
- Batería run9: 24 turnos, 0 plantillas, 2 reparaciones, $0.00091/turno. C15: Couple en azul → lacas Blu Notte/Ceruleo bajo pedido.

## Métricas de la suite (gpt-4o-mini, datos en modo dev, sin validar)

| Corrida | Plantilla de respaldo | Reparaciones | Costo/turno | p50 | p95 |
|---|---|---|---|---|---|
| run1 | 11/22 | 2 | $0.00086 | 4,0 s | 4,7 s |
| run3 | 0/22 | 1 | $0.00077 | 2,9 s | 3,6 s |
| run4 | 0/22 | 6 | $0.00085 | 2,6 s | 5,2 s |
| run5 (datos de capturas) | 1/22 | 5 | $0.00081 | 2,9 s | 4,6 s |
| run6 (+ ajustes de redacción) | 0/22 | 4 | $0.00094 | 2,6 s | 4,6 s |
| run14 (estilos) | 0/26 | 5 | $0.00084 | 2,3 s | 4,0 s |
| run17 (preguntas 4–7) | 0/26 | 4 | $0.00084 | 2,2 s | 3,6 s |

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
1. Edd comparte los dos Excel de Descargas. Con lo que vuelva:
   - decisiones: se aplican a mano;
   - base de datos: `python scripts/import-database-xlsx.py <archivo>` (y luego `--apply`).
2. Hecho: "Llévame" en la misma panorámica, integración v2 (por omisión), "Ver alternativas" en v2 y widget en el idioma de la conversación.
3. Bake-off de GPT baratos con la misma batería. Suite dorada sobre un catálogo ficticio congelado.

## Bloqueos
- Ninguno técnico. El catálogo estricto ya es usable (818/818 con fuente literal). Falta la hoja corta de decisiones y la lista de acabados del showroom.

## Gasto en APIs
≈ US$0.40 estimado: 17 corridas de 22 a 26 turnos más las pruebas sueltas de cliente, todo con gpt-4o-mini.
