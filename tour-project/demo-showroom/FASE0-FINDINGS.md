# Fase 0 — Hallazgos del spike de 3DVista

Verificado en vivo con computer-use (editor) + Browser pane con consola JS (build exportado), no asumido. Corregir `tour-bridge`/`catalog`/scripts a partir de esto, no al revés.

## Versión instalada

**3DVista Virtual Tour PRO 2026.1.0** (Adobe AIR), Player runtime `v:2359`. Había una actualización a 2026.1.1 disponible (release notes: fixes de recursos huérfanos en scripts y un bug raro de cambio de panorama en Waypoints) — **se rechazó la actualización** para no modificar la instalación sin necesidad; no se probó con 2026.1.1.

## Formatos de imagen aceptados para "Panorama Standard"

El selector de archivos del import (`Añadir Panorama > Panorama Standard`) filtra exactamente:
`*.jpg;*.jpeg;*.tif;*.png;*.dng;*.JPG;*.JPEG;*.TIF;*.TIFF;*.PNG;*.DNG;*.psb;*.PSB`

**WebP NO está soportado como formato de importación**, a pesar de que el compresor `360_optimizer` lo ofrece como salida. Los 3 paneles de la demo se comprimieron a **JPEG** (calidad 82, progressive, subsampling 4:4:4) en vez de WebP — resultado ~3.6-4MB por imagen (partiendo de ~30MB), dentro del objetivo de 5MB. El export final de 3DVista sí re-encodea todo internamente a tiles WebP propios (`media/panorama_<GUID>_0/{face}/{level}/{row}_{col}.webp`), pero eso es interno al motor, no controlable desde el import.

## Nombres de media: "Título" (label) vs id interno

Al importar, 3DVista asigna cada panorama un **id interno opaco tipo GUID** (ej. `panorama_19A9B683_1219_773F_416E_A5A4BE047705`) que aparece en las rutas de archivos exportados. El campo **"Título"** que se edita en el panel "Ajustes de Panorama" (lo que escribimos como `sala-a`, `sala-b`, `sala-c`) se guarda como `data.label` en el modelo del reproductor — **este es el "nombre" real que usan las funciones `*ByName`**, confirmado leyendo el código fuente de `setMainMediaByName` en el build exportado:

```js
// TDV.Tour.Script.setMainMediaByName (minificado, reformateado):
function(name) {
  var mainViewer = this.getMainViewer();
  var playlists = this._getPlayListsWithViewer(mainViewer);
  for (playlist of playlists) {
    for (item of playlist.get('items')) {
      var data = item.get('media').get('data');
      if (data.label == name && item.get('player').get('viewerArea') == mainViewer) {
        playlist.set('selectedIndex', /* índice de item */);
        return item;
      }
    }
  }
}
```

**Conclusión: `media_name` en `catalog.json`/`tour.config.json` debe ser el Título (`sala-a`, `sala-b`, `sala-c`), no el GUID.** Ya coincide con lo configurado.

## Mecanismo 1 — Player API (mecanismo primario definitivo, corregido dos veces)

`window.player` **no existe** en el build exportado (la suposición original del `.md` de negocio, `window.player.setMainMediaByName()`, es incorrecta para esta versión). La API real:

- `window.tour` existe (instancia del motor Adobe-AIR-en-web).
- `window.tour.player` es un **registro/kernel** de objetos (`getById`, `getByClassName`, `createInstance`...), no el player en sí.
- **El objeto real con los métodos de scripting es `window.tour.player.getById('rootPlayer')`.**

### Primer intento (INCORRECTO, reemplazado — se deja documentado como advertencia)

```js
const rootPlayer = window.tour.player.getById('rootPlayer');
rootPlayer.setMainMediaByName('sala-c');
const activePlayer = rootPlayer.getActivePlayerWithViewer(rootPlayer.getMainViewer());
activePlayer.set('yaw', 30); activePlayer.set('pitch', -10); activePlayer.set('hfov', 55);
```

Esto pasó todas las pruebas automatizadas que se hicieron en su momento (leer `.get()` inmediatamente después del `.set()`, incluso segundos después en el mismo tick) — pero **un usuario real probando la app encontró que la cámara siempre volvía a yaw:0/pitch:0** al cabo de un momento. Investigando con más cuidado (monitoreo continuo, no solo una lectura puntual) se confirmó que `getActivePlayerWithViewer` devuelve un **objeto de reproductor transicional**: una vez que la lógica propia de activación del panorama termina, resetea la cámara a la posición por defecto del panorama — sin importar lo que se haya escrito en ese objeto transicional. Ese reset a "posición por defecto" es exactamente lo que hace un hotspot nativo de 3DVista con acción "Abrir Panorama" (que no toca yaw/pitch en absoluto) — coincidencia que fue la pista que destapó el bug: el usuario había agregado un hotspot de flecha manualmente y solo ESE parecía mover la vista.

### Mecanismo correcto (confirmado, en uso)

La posición de cámara real que el motor aplica al activar un panorama vive en el objeto **`PanoramaCamera`** de ese panorama (`item.get('camera')` del item de playlist correspondiente), específicamente en su sub-objeto `initialPosition`. Hay que escribir ahí **antes** de disparar el cambio de media, no después:

```js
const registry = window.tour.player;
const rootPlayer = registry.getById('rootPlayer');
const playlist = registry.getById('mainPlayList');
const item = playlist.get('items').find(i => i.get('media').get('data').label === 'sala-c');
const camera = item.get('camera');
const initialPosition = camera.get('initialPosition');
initialPosition.set('yaw', 30);
initialPosition.set('pitch', -10);
initialPosition.set('hfov', 55);
rootPlayer.setMainMediaByName('sala-c');   // ahora sí activa el panorama CON esa posición
```

Verificado con monitoreo continuo (6-8 segundos, sin drift) y con captura de pantalla real antes/después mostrando contenido visualmente distinto (de la vista amplia del río a un primer plano de hojas, zoom y ángulo distintos) — no solo lectura del modelo de datos. `packages/tour-bridge/src/player-api-navigator.ts` implementa exactamente esta secuencia, ubicando el item de playlist por `media.data.label` (igual que el propio `setMainMediaByName` interno de 3DVista) en vez de asumir una convención de nombres de GUID.

Este es el **único mecanismo confirmado que realmente reorienta la cámara de forma persistente** — ver corrección importante en Mecanismo 2.

## Mecanismo 2 — URL Hash (media funciona, cámara NO — descartado como primario)

El motor tiene un listener nativo `window.tour._onHashChange` y una función generadora `TDV.Tour.Script.updateDeepLink` cuyo código fuente revela el formato que el propio 3DVista genera:

```
#media-name=<label-url-encoded>&yaw=<num>&pitch=<num>&fov=<num>
```

**Importante**: el parámetro es `media-name` (con guion), **no** `media` como asumía el documento de contexto original.

**Corrección crítica (encontrada después de un reporte real de usuario, no en la primera pasada de Fase 0)**: se había marcado el cambio de `selectedIndex` como prueba suficiente de que el hash funcionaba, pero **nunca se verificó si la cámara (yaw/pitch/fov) realmente se movía** — solo se comprobó que el panorama activo cambiaba. Al reproducir el flujo real end-to-end (clic en "Llévame" del widget), el usuario reportó que la vista nunca cambiaba de ángulo. Se verificó directamente leyendo `activePlayer.get('yaw'|'pitch'|'hfov')` antes y después de fijar el hash — **tanto con `location.hash =` después de cargar, como con el hash ya presente desde una carga fresca de página** — y en ambos casos los valores quedaban sin cambio (`yaw:0, pitch:0, hfov:90`, los valores por defecto del panorama), pese a que `selectedIndex` sí cambiaba correctamente:

```js
window.location.hash = 'media-name=sala-a&yaw=120&pitch=-8&fov=62';
// selectedIndex cambia bien, PERO:
activePlayer.get('yaw')  // -> 0 (no 120) — el hash NO aplicó la cámara
```

**Decisión final (corregida)**: `tour-bridge` usa **Player API (Mecanismo 1) como estrategia primaria** — es el único que confirmadamente mueve la cámara. El hash queda como **fallback solo para cambio de panorama** (no garantiza yaw/pitch/fov correctos), documentado así en el código.

## Persistencia del DOM entre navegaciones (confirmado)

Se inyectó un `<div>` marcador vía `document.body.appendChild(...)` y se disparó navegación por ambos mecanismos (Player API y hash) — **el marcador sobrevivió en ambos casos, sin recarga de página**. Esto confirma que un widget montado una sola vez en `document.body` persistirá correctamente a través de cambios de panorama, sea cual sea el mecanismo de navegación elegido.

## Bug adicional: navegación al MISMO panorama que ya está activo

Encontrado al reproducir el escenario exacto de una prueba real de usuario (primer producto pedido resultó estar en `sala-a`, que es el panorama con el que arranca el tour). `rootPlayer.setMainMediaByName(mediaName)` es un no-op cuando `mediaName` ya es el panorama activo (`playlist.set('selectedIndex', mismoValor)` no dispara la reactividad interna que re-lee `initialPosition`) — así que el fix de la sección anterior nunca llegaba a aplicarse para este caso, aunque `initialPosition` sí quedaba escrito correctamente.

**Fix**: en `navigateTo()`, si el panorama objetivo ya es el activo, además de escribir `camera.initialPosition` se escribe directamente `rootPlayer.getActivePlayerWithViewer(viewer).set('yaw'|'pitch'|'hfov', ...)` — seguro en este caso específico porque, al no haber ninguna transición/activación en curso, no hay ningún reset posterior que lo sobrescriba (el reset problemático de la sección anterior solo ocurre como parte de una activación real).

Verificado con clic real en el botón (vía barra fija, ver abajo): `sala-a, yaw:-150, pitch:5, hfov:58` (Lámpara de Pie Arco) exacto y estable, incluso después de continuar la conversación con una pregunta no relacionada.

## Bug de UX: el botón "Llévame" quedaba enterrado por el auto-scroll del chat

Un usuario probando la app en vivo reportó "no hay botón Llévame, nunca va a funcionar" — inspeccionando el DOM real de su sesión (vía CDP, sin tocar nada) se confirmó que **las tarjetas de producto sí existían**, con sus 3 botones, pero habían quedado desplazadas fuera de vista: el contenedor de mensajes hace auto-scroll al fondo en cada turno nuevo, así que una tarjeta de 2 turnos atrás queda enterrada arriba, sin ninguna señal visual de que sigue ahí.

**Fix**: se agregó una barra fija (`packages/assistant-ui/src/pinned-product.ts`), ubicada fuera del contenedor con scroll (entre los mensajes y los chips de sugerencias), que siempre muestra el último producto navegado con su botón "Llévame" — sobrevive a cualquier cantidad de turnos posteriores de la conversación. Verificado en vivo: tras navegar a un producto y luego preguntar por una categoría distinta, la barra fija sigue mostrando el producto anterior con su botón funcional.

## Mecanismo de inyección en la skin

Se probaron tres vías:

1. **Acción "Ejecutar Javascript" en un panorama, disparador "Al Inicio"** — **probada y descartada**. En el editor: `Panoramas > [panel] > Ajustes > Acciones Panorama > + > Ejecutar Javascript`. El código se incrusta en el `begin` handler del item de playlist correspondiente en `script_general.js`. Se confirmó por inspección de código que el snippet se exporta correctamente, pero **en pruebas en vivo (build exportado, servido por HTTP) nunca se ejecutó**: ni en la carga inicial del tour, ni al reingresar a `sala-a` mediante `setMainMediaByName('sala-a')` después de navegar a otro panorama. Hipótesis: `begin`/`end` de un `PanoramaPlayListItem` está pensado para lógica de encadenado de autoplay (de hecho el propio código generado encadena `this.setEndToItemIndex(...)`), no como hook fiable de "panorama activo", al menos no a través de las rutas de navegación que probamos. **No usar este mecanismo** sin volver a verificarlo si cambia la versión de 3DVista.
2. **Componente de Skin "Visor Web" ("WebFrame")**: encontrado en el editor de Skin (icono `</>`, tooltip "Visor Web"). Es un **iframe** (su panel de propiedades muestra un campo "URL:"), no un contenedor de HTML/JS crudo — el widget necesitaría `window.parent.tour`/`window.parent.location.hash` por el aislamiento del iframe. Se colocó y se retiró de prueba, no se implementó. Queda como alternativa de respaldo (ver instrucción del usuario: solo probarla si el mecanismo 3 fallara).
3. **Parche estático post-export de `index.htm`** — **probado y confirmado, mecanismo definitivo**. Tras `Publicar > Web`, se inserta `<link rel="stylesheet" href=".../assistant.css">` y `<script src=".../assistant.bundle.js"></script>` justo antes de `</body>` del `index.htm` exportado (script `scripts/inject-widget.mjs`, idempotente — no duplica si ya está inyectado). Confirmado en vivo: el widget monta (`launcher`, `card`, tema turquesa `rgb(20,184,166)` aplicado), y **sobrevive completo** (montado + chat abierto) a una navegación real vía hash (`#media-name=sala-b&yaw=-90&pitch=-15&fov=65`, coordenadas reales de `mesa-roble-01` del catálogo).

**Decisión final**: mecanismo 3 (parche post-export de `index.htm`). Es más simple, determinista, versionable como código y no depende de la semántica ambigua/poco fiable de las acciones por panorama de 3DVista. Se integra al pipeline como `npm run inject:widget`, después de `build:bundle` y de exportar el tour.

## Nombres de media confirmados para `tour.config.json`

| Título (label) | id interno (GUID, no usar) | Frame origen |
|---|---|---|
| `sala-a` | `panorama_19A9B683_1219_773F_416E_A5A4BE047705` | `frame_000000_0.000s.png` |
| `sala-b` | `panorama_199B2EE7_1219_74C6_41B0_B36B54B0C888` | `frame_000246_8.208s.png` |
| `sala-c` | `panorama_1E82FD76_1218_B5C6_41B0_27C2A758B8B5` | `frame_000491_16.383s.png` |

## Bug crítico encontrado post-demo: "Reproducir en bucle" (autoplay) sobrescribe la navegación

**Síntoma reportado por el usuario**: probando la app real, el chat respondía "te he llevado a X" pero la vista nunca parecía cambiar de lugar.

**Diagnóstico**: se usó el skill `browser` (CDP directo vía `openghost-workspace/.claude/skills/browser/browser_server.py`, Chrome aislado y nuevo en el puerto 9222, sin ninguna sesión/caché previa) para verificar el estado real del motor antes/después de cada navegación, en vez de confiar en capturas visuales o en `computer-use`. Con eso se confirmó que:

1. La llamada de navegación (`rootPlayer.setMainMediaByName(...)` + `activePlayer.set('yaw'|'pitch'|'hfov', ...)`, ver Mecanismo 1) sí fijaba los valores correctos en el instante de la llamada.
2. Pero, monitoreando el estado cada 2 segundos tras la navegación, **el yaw derivaba solo, de forma continua** (ej. 30° → 39° → 87° → 135° → -175° en 8 segundos) sin ninguna interacción externa.
3. Causa raíz: cada uno de los 3 paneles tenía **"Ajustes de Autoplay" → "Reproducir en bucle"** activado por defecto (`Panoramas > [panel] > Ajustes > Ajustes de Autoplay`, con Velocidad 15 e Inercia 50) — 3DVista arranca automáticamente esta rotación de "recorrido" cada vez que el panorama se activa, y sobrescribe frame a frame cualquier yaw/pitch/fov que el código haya fijado.

**Fix aplicado**: se desactivó "Reproducir en bucle" en los 3 paneles (`sala-a`, `sala-b`, `sala-c`) dentro del editor de 3DVista, se guardó el proyecto y se volvió a exportar (`Publicar > Web`) + reinyectar el widget (`npm run inject:widget`, necesario después de cada export porque sobreescribe `index.htm`).

**Verificación post-fix** (mismo método CDP, Chrome aislado, carga fresca sin caché):
```
estado inicial tras carga fresca:      {label:"sala-a", yaw:0, pitch:0, hfov:90}
tras navegar a sala-c/30/-10/55:
  t+0s: {label:"sala-c", yaw:30, pitch:-10, hfov:55}
  t+2s: {label:"sala-c", yaw:30, pitch:-10, hfov:55}
  t+4s: {label:"sala-c", yaw:30, pitch:-10, hfov:55}
  t+6s: {label:"sala-c", yaw:30, pitch:-10, hfov:55}
  t+8s: {label:"sala-c", yaw:30, pitch:-10, hfov:55}   <- cero deriva
```
Y repitiendo el flujo real completo (clic real en "Llévame" del bundle compilado, sin código replicado a mano): `sala-b, yaw:160, pitch:10, hfov:55` estable durante 6s.

**Implicación para clientes futuros**: cualquier tour nuevo debe tener "Reproducir en bucle" desactivado en cada panorama antes de integrar el chatbot, o la navegación programática se verá "revertida" por el autoplay. Vale la pena añadir esto a un checklist de onboarding por tour.

**Nota sobre el proceso de esta sesión de debugging**: varios scripts de diagnóstico intermedios usaron `const` a nivel superior en llamadas CDP repetidas sobre la misma pestaña, lo que causó errores silenciosos de "Identifier ya declarado" que parecían (incorrectamente) indicar que la navegación fallaba. Ese fue un artefacto del arnés de pruebas, no del producto — la lección es envolver siempre el JS de diagnóstico en un IIFE (`(function(){...})()`) al reutilizar una misma pestaña/página a través de múltiples llamadas `Runtime.evaluate`.

## Otros hallazgos

- Los 3 paneles son una toma **casi estática** de la misma bifurcación del río (16s continuos, sin cambio real de ubicación) — ver nota en el plan aprobado. Se usan como 3 "salas" ficticias de todos modos; los valores de yaw/pitch por producto en el catálogo son estimaciones visuales, no medidos con precisión contra el proyecto real.
- El proyecto nativo se guardó en `tour-project/demo-showroom/demo-showroom.vtp`.
- El export HTML5 (`Publicar > Web`) se generó en `tour-project/demo-showroom/tour-export/` — `index.htm` + `script.js`/`script_general.js` + tiles en `media/`.
- Verificado que el export corre correctamente servido por HTTP (`localhost:5500`), evitando `file://` (que rompería CORS hacia el backend más adelante).

## Pendiente para fases siguientes

- No se probó el componente Skin "Visor Web" (WebFrame/iframe) como alternativa de inyección — queda para una iteración futura si el parche a `index.htm` resulta insuficiente en un cliente real con un skin no vacío.
- Lección para el proceso: la verificación de Fase 0 originalmente se dio por buena solo con `selectedIndex` cambiando, sin comprobar el efecto visual/de cámara real — quedó como hallazgo "no verificado visualmente" documentado, pero aun así casi pasó a producción del demo sin corregirse hasta que el usuario probó la app real y notó que no navegaba. Para clientes reales, siempre validar con captura de pantalla o lectura directa de yaw/pitch/hfov antes/después, no solo el índice de selección.
