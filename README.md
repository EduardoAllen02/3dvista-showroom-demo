# 3dvista-assistant

Núcleo privado reutilizable para el chatbot/agente embebido en tours virtuales de 3DVista. Ver `C:\Users\Yeyian PC\Downloads\CONTEXTO_PROYECTO_CHATBOT_3DVISTA_PARA_CLAUDE_CODE.md` para el contexto completo de negocio y arquitectura.

## Arquitectura

- `packages/` — núcleo compartido (UI del widget, puente de navegación a 3DVista, motor de catálogo, adaptadores de modelo de IA).
- `server/` — template de backend. **Cada tour/cliente final se despliega con su propia instancia de este backend** (con su propio `.env`, catálogo y config) — no es un backend central multi-tenant.
- `clients/<tour>/` — configuración, catálogo y branding específicos de un tour.
- `scripts/` — build del bundle por tour, validación de catálogo, adaptador Excel→JSON.
- `dist/<tour>/` — bundle final (`assistant.bundle.js` + `.css`) para inyectar en la skin de ese tour.

## Regla de seguridad central

El modelo de IA **nunca** inventa `media_name`/`yaw`/`pitch`/`fov`. Solo elige un `product_id` mediante la herramienta `navigate_to_product`; el backend resuelve las coordenadas reales desde el catálogo validado de ese tour.

## Demo actual: `demo-showroom`

Ver `clients/demo-showroom/` y `tour-project/demo-showroom/FASE0-FINDINGS.md` para los hallazgos de la inspección de 3DVista (versión, formatos de imagen aceptados, mecanismos de navegación confirmados, mecanismo de inyección del widget).

**Importante**: el widget se inyecta parcheando `tour-export/index.htm` después de cada exportación (`npm run inject:widget`) — la acción "Ejecutar Javascript" del editor de 3DVista se probó y **no resultó confiable** (ver FASE0-FINDINGS.md), así que no se usa.

## Desarrollo

```bash
npm install
npm run xlsx:demo-showroom      # genera catalog.json desde catalog.xlsx
npm run validate:catalog        # valida catalog.json
npm run build:bundle            # genera dist/demo-showroom/assistant.bundle.js
npm run inject:widget           # parcha tour-project/demo-showroom/tour-export/index.htm
npm run server:dev              # backend en :8787
npm run serve:demo              # sirve tour-export/ + dist/ en :5500
```

Copiar `server/.env.example` a `server/.env` y completar `OPENAI_API_KEY` antes de levantar el backend. Cada vez que se re-exporte el tour desde 3DVista (`Publicar > Web`), hay que volver a correr `npm run inject:widget` (el export sobreescribe `index.htm`).
