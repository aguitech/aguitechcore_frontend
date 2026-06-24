# Landing page + Agendamiento público

Página de inicio (`/`) pública, sin auth. Sirve como vitrina + punto de entrada para nuevos clientes.

## Secciones

1. **Nav sticky** — brand, links a Features/Agendar/Blog, CTA login o ir-al-panel
2. **Hero** — título, sub, 2 CTAs (agendar, blog), trust badges animados
3. **Features grid** — 6 cards (apps web, IA, móvil, dashboards, integraciones, seguridad)
4. **Booking widget** — 3 pasos:
   - Paso 1: calendario (deshabilita domingos + días pasados)
   - Paso 2: slot grid 9:00-18:30 en intervalos de 30min (slots ocupados deshabilitados)
   - Paso 3: form (nombre, email, teléfono, asunto, descripción, modalidad, asignado a)
5. **Success state** — confirmación con resumen + links a "Mis citas" o login
6. **Footer** — brand + links

## Responsive
- Mobile-first
- Calendario + form colapsan a 1 columna en <900px
- Hero art (cards flotantes) se oculta en móvil
- Hamburger menu en `Layout.jsx` para el app interno (no afecta landing)

## Configuración
- El widget usa `/api/appointments/public/staff` para llenar el selector "¿Con quién?"
- Los slots ocupados se consultan en `GET /api/appointments/public/availability`
- Al confirmar: `POST /api/appointments/public` con `source: 'public'`

## Branding
- Color primario: `#FF6A00` (naranja Aguitech)
- Logo: ⚡ emoji
- Tipografía: system-ui

## SEO
- Single-page, sin SSR
- Title y meta description en `index.html` (configurar antes de deploy)
- Open Graph tags pendientes (TODO)

## Personalización
- Lista de features: editar `client/src/pages/Landing.jsx` → array `landing-feat-grid`
- Trust badges: editar `<div className="landing-trust">`
- Time slots: `HOURS = []` array en `Landing.jsx` (default 9:00-18:30 cada 30min)
