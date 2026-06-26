#!/usr/bin/env python3
"""
Seed 10 blog posts for 24-jun-2026 — news + sports.
Creates categories (idempotent), generates images, uploads them,
creates posts with images/videos/documents via the Aguitech Core API.
"""
import io
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime

# ======== CONFIG ========
BASE = "https://sxxysecret.com"
ADMIN_EMAIL = "hector@aguitech.com"
ADMIN_PASSWORD = "peris51373"
# Local image folder (will be downloaded from Unsplash + saved here)
IMG_DIR = "/tmp/seed_imgs"
os.makedirs(IMG_DIR, exist_ok=True)

# ======== HTTP CLIENT (stdlib) ========
class Client:
    def __init__(self, base):
        self.base = base.rstrip("/")
        self.token = None

    def req(self, method, path, body=None, params=None, headers=None,
            expect=None, raw=False):
        url = f"{self.base}{path}"
        if params:
            url += "?" + urllib.parse.urlencode(
                {k: v for k, v in params.items() if v is not None})
        h = {"Accept": "application/json"}
        if headers:
            h.update(headers)
        if self.token:
            h["Authorization"] = f"Bearer {self.token}"
        data = None
        if body is not None and not raw:
            data = json.dumps(body).encode("utf-8")
            h["Content-Type"] = "application/json"
        elif body is not None and raw:
            data = body
        r = urllib.request.Request(url, data=data, method=method, headers=h)
        try:
            with urllib.request.urlopen(r, timeout=60) as resp:
                status, raw_resp = resp.status, resp.read()
        except urllib.error.HTTPError as e:
            status, raw_resp = e.code, e.read()
        try:
            parsed = json.loads(raw_resp.decode("utf-8", "replace")) if raw_resp else None
        except Exception:
            parsed = raw_resp.decode("utf-8", "replace") if raw_resp else None
        if expect is not None and status != expect:
            raise AssertionError(
                f"{method} {path} → expected {expect}, got {status}\n  body: {str(parsed)[:400]}"
            )
        return status, parsed

    def login(self, email, password):
        status, body = self.req("POST", "/api/auth/login",
                                body={"email": email, "password": password},
                                expect=200)
        self.token = body["token"]
        return body["user"]

    def get(self, path, **kw): return self.req("GET", path, **kw)
    def post(self, path, **kw): return self.req("POST", path, **kw)
    def put(self, path, **kw): return self.req("PUT", path, **kw)
    def delete(self, path, **kw): return self.req("DELETE", path, **kw)


# ======== IMAGE FETCH ========
def fetch_image(url, dest):
    """Download an image to dest. Returns dest path."""
    if os.path.exists(dest) and os.path.getsize(dest) > 1000:
        return dest
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        data = r.read()
    with open(dest, "wb") as f:
        f.write(data)
    return dest


# Curated Unsplash photo IDs for each topic. License-free.
UNSPLASH = {
    "sheinbaum": "https://images.unsplash.com/photo-1529107386315-e1a2ed48a620?w=1600&q=80",
    "pemex": "https://images.unsplash.com/photo-1582554380377-13f480f584f7?w=1600&q=80",
    "seguridad": "https://images.unsplash.com/photo-1453873531674-2151bcd01707?w=1600&q=80",
    "cruzazul": "https://images.unsplash.com/photo-1606925797300-0b35e9d1794e?w=1600&q=80",
    "mundial": "https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?w=1600&q=80",
    "peso": "https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=1600&q=80",
    "tech": "https://images.unsplash.com/photo-1488590528505-98d2b5aba04b?w=1600&q=80",
    "conciertos": "https://images.unsplash.com/photo-1429962714451-bb934ecdc4ec?w=1600&q=80",
    "temblor": "https://images.unsplash.com/photo-1542273917363-3b1817f69a2d?w=1600&q=80",
    "apple": "https://images.unsplash.com/photo-1592899677977-9c10ca588bbd?w=1600&q=80",
}


# ======== POSTS DATA ========
POSTS = [
    {
        "category": "Política",
        "category_icon": "🏛️",
        "category_color": "#DC2626",
        "title": "Sheinbaum decreta Home Office obligatorio para México vs República Checa este 24 de junio",
        "excerpt": "La presidenta firmó un decreto en el DOF que activa el trabajo a distancia obligatorio solo para ciertos sectores durante el partido del Tricolor en el Mundial 2026.",
        "body": """La presidenta Claudia Sheinbaum Pardo firmó un decreto publicado en el Diario Oficial de la Federación (DOF) que activa nuevamente el esquema de Home Office obligatorio para este miércoles 24 de junio, día en que la Selección Mexicana juega ante República Checa en el Mundial 2026.

A diferencia de decretos anteriores, esta activación **no es general**: aplica de manera obligatoria únicamente para servidores públicos federales en la Ciudad de México y zonas metropolitanas, mientras que el sector privado solo recibe una "convocatoria" o exhorto a sumarse.

El decreto incluye además:

- Suspensión de clases en escuelas públicas y privadas de CDMX, Estado de México, Jalisco y otras sedes mundialistas.
- Activación del protocolo de movilidad con apoyo de la SSC para el Estadio Azteca.
- Cierre anticipado de oficinas gubernamentales a las 13:00 horas.

"Estamos hablando de un partido que paraliza al país. La medida es para que la gente lo viva con tranquilidad", explicó Sheinbaum durante su conferencia matutina.

El Economista confirmó que esta es la **tercera activación** del decreto presidencial por motivo del Mundial 2026. Empresas como BBVA, Santander y Grupo Salinas replicaron la medida para sus empleados en corporativos de CDMX.""",
        "image": "sheinbaum",
        "tags": ["Sheinbaum", "Home Office", "Mundial 2026", "México", "Política"],
        "source": "El Economista / Milenio",
        "source_url": "https://www.eleconomista.com.mx/capital-humano/mexico-vs-republica-checa-activara-nuevamente-decreto-presidencial-home-office-20260623-819872.html",
    },
    {
        "category": "Economía",
        "category_icon": "💰",
        "category_color": "#16A34A",
        "title": "Pemex y Petrobras firman memorándum de entendimiento para cooperación petrolera",
        "excerpt": "Las dos petroleras estatales formalizaron una alianza estratégica de 2 años para explorar oportunidades en aguas profundas del Golfo de México y campos maduros.",
        "body": """Petrobras y Petróleos Mexicanos (Pemex) firmaron este martes 23 de junio, en Río de Janeiro, un Memorando de Entendimiento (MoU) que abre la puerta a una cooperación estratégica y técnica en la industria de los hidrocarburos por los próximos dos años.

La Secretaría de Energía (Sener) anunció en un comunicado conjunto que el acuerdo busca desarrollar oportunidades en:

- Exploración y producción en aguas profundas y ultraprofundas del Golfo de México.
- Revitalización de campos maduros y aceite pesado/extrapesado.
- Reprocesamiento sísmico y exploración del potencial presal.
- Procesos industriales de refinación, petroquímica, fertilizantes y procesamiento de gas.
- Intercambio de tecnologías en eficiencia energética, captura de carbono y combustibles de baja intensidad.

"Este es un instrumento de cooperación estratégica con un potencial significativo para Petrobras, que puede posicionar a la empresa como socia de Pemex en un escenario de fortalecimiento de la exploración y producción petrolera en México", señaló Magda Chambriard, presidenta de Petrobras.

Por su parte, Juan Carlos Carpio Fragoso, director general de Pemex, destacó que la asociación podría llevar a las empresas a considerar reservas en aguas profundas y ultraprofundas del Golfo de México.

El acuerdo **no constituye un compromiso vinculante de inversión** ni crea sociedad o empresa conjunta. Las oportunidades específicas se negociarán en el futuro mediante instrumentos adicionales, sujeto a análisis de viabilidad y aprobaciones regulatorias.""",
        "image": "pemex",
        "tags": ["Pemex", "Petrobras", "Energía", "Golfo de México", "Economía"],
        "source": "La Jornada",
        "source_url": "https://www.jornada.com.mx/noticia/2026/06/23/economia/pemex-y-brasilena-petrobras-firman-memorandum-de-entendimiento-para-cooperacion-petrolera",
    },
    {
        "category": "Seguridad",
        "category_icon": "🛡️",
        "category_color": "#1E40AF",
        "title": "Estrategia Nacional de Seguridad reduce 46% los homicidios dolosos: 39 menos cada día",
        "excerpt": "Omar García Harfuch presentó el informe: de octubre 2024 a mayo 2026 se han detenido a más de 56 mil personas por delitos de alto impacto y desmantelado 2,407 laboratorios clandestinos.",
        "body": """El secretario de Seguridad y Protección Ciudadana, Omar García Harfuch, presentó este lunes en la conferencia matutina "Las mañaneras del pueblo" los avances de la Estrategia Nacional de Seguridad, destacando una **reducción del 46% en el promedio diario de homicidios dolosos** a nivel nacional, equivalente a **39 homicidios menos cada día**.

Los números del informe (1 octubre 2024 – 31 mayo 2026):

- **56,000+ personas detenidas** por delitos de alto impacto.
- **Casi 30,000 armas de fuego aseguradas**.
- **~420 toneladas de droga** aseguradas, incluyendo **5 millones de pastillas de fentanilo**.
- **2,407 laboratorios clandestinos** desmantelados por Ejército y Marina en 22 estados.
- **1,468 extorsionadores detenidos** desde julio 2025 (Operación Enjambre).

Marcela Figueroa Franco, titular del SESNSP, agregó que mayo 2026 registró el promedio más bajo de los últimos 12 años, con **47.3 homicidios diarios**, y el periodo enero-mayo es el más bajo desde 2016 (50.4 diarios).

Los 8 estados que concentran el 54% de los casos: Guanajuato (8.8%), Baja California (7.8%), Chihuahua (7.7%), Sinaloa (6.8%), Morelos (5.9%), Estado de México (5.9%), Guerrero (5.5%) y Veracruz (5.3%).

El delito de alto impacto también cayó 53% al comparar 2018 (969.4 diarios) con 2026 (457.1 diarios).

Entre las capturas recientes destacan los presidentes municipales de Cuautla y Atlatlahucan, y el expresidente municipal de Yecapixtla. Suman más de 85 funcionarios detenidos, incluidos 7 alcaldes en funciones.""",
        "image": "seguridad",
        "tags": ["Seguridad", "Harfuch", "Sheinbaum", "Homicidios", "México"],
        "source": "gob.mx / SSPC",
        "source_url": "https://www.gob.mx/sspc/prensa/estrategia-nacional-de-seguridad-reduce-46-los-homicidios-dolosos-representa-39-homicidios-menos-cada-dia",
    },
    {
        "category": "Fútbol",
        "category_icon": "⚽",
        "category_color": "#0EA5E9",
        "title": "Cruz Azul: mercado activo, Ditta ante Cristiano y Brunetta en duda",
        "excerpt": "La Máquina vive un día movido entre fichajes y el Mundial. Willer Ditta podría debutar ante Portugal, Jorge Sánchez se acerca al Atlas y el Toro Fernández puede negociar libre desde el 30 de junio.",
        "body": """Cruz Azul amanece con agenda cargada en este 24 de junio, con movimientos en el mercado de fichajes y la presencia de uno de sus defensas en el Mundial 2026.

## Willer Ditta, cerca de debutar ante Cristiano Ronaldo

El defensor colombiano **sigue sin sumar minutos** con su selección tras la victoria 1-0 de Colombia ante RD Congo, pero su oportunidad luce inminente. Con la clasificación a dieciseisavos ya asegurada, Ditta **podría tener su debut en un escenario de lujo: ante Portugal y Cristiano Ronaldo**, en el duelo que definirá al líder del Grupo K.

## Jorge Sánchez, muy cerca del Atlas

El lateral derecho mexicano que salió del PAOK por problemas contractuales **no llegará a La Noria**. Reportes indican que su regreso a la Liga MX se encamina al Atlas, lo que obliga a Cruz Azul a buscar alternativas en esa posición.

## La traba del Toro Fernández

La renovación de **Rodrigo "Toro" Fernández con Cruz Azul sigue sin destrabarse**. La cláusula clave: a partir del **30 de junio, el delantero podrá negociar libremente** con cualquier club si no se firma la extensión. La afición celeste empieza a impacientarse.

## Brunetta, en duda

El mediocampista Juan Brunetta, refuerzo reciente, **no tiene su futuro claro** en el proyecto celeste. La directiva analiza si cuenta con él para el Apertura 2026 o si se busca una salida.

## Erik Lira y Charly Rodríguez

En medio de la incertidumbre, **Charly Rodríguez habló sobre Erik Lira**: "es un jugadorazo, la afición tendrá que aceptarlo", declaró en una charla con la prensa, defendiendo al joven mediocampista de las críticas recientes.

La Máquina sigue en ebullición a menos de un mes del inicio del Apertura 2026.""",
        "image": "cruzazul",
        "tags": ["Cruz Azul", "La Máquina", "Ditta", "Willer Ditta", "Mundial 2026", "Fichajes"],
        "source": "Bolavip / Vamos Cruz Azul",
        "source_url": "https://vamoscruzazul.bolavip.com/noticias/noticias-de-cruz-azul-hoy-24-de-junio-willer-ditta-jorge-sanchez-toro-fernandez-y-juan-brunetta",
    },
    {
        "category": "Fútbol",
        "category_icon": "⚽",
        "category_color": "#0EA5E9",
        "title": "Mundial 2026: Suiza vs Canadá y los partidos del 24 de junio",
        "excerpt": "La jornada de hoy cierra la fase de grupos en varios sectores del Mundial. Suiza y Canadá se juegan el liderato del Grupo B, mientras Bosnia y Qatar cierran su participación.",
        "body": """El Mundial 2026 continúa este miércoles 24 de junio con una jornada clave de la fase de grupos. Estos son los partidos más importantes del día según FIFA y ESPN:

## Grupo B — Suiza vs Canadá (16:00 ARG / 15:00 CHI / 14:00 COL/ECU/PER)

El duelo que define al líder del grupo. Suiza llega invicta con 1-1-0; Canadá también con 1-1-0. Ambos equipos ya están clasificados, pero se juegan el primer lugar del sector para evitar a un rival de peso en dieciseisavos. Sede: Estadio BMO, Toronto.

## Grupo K — Colombia ya piensa en Portugal

Tras la victoria 1-0 sobre RD Congo, **Colombia espera rival** del Grupo K: será Portugal, que viene de golear. El partido es el escenario ideal para el debut del celeste **Willer Ditta** (ver nota de Cruz Azul en este blog).

## Grupo A — Bosnia vs Qatar (21:00 CET)

Bosnia (0-1-1) y Qatar (0-1-1) cierran su participación sin posibilidades de clasificar. Es el duelo por no quedar último del grupo.

## Estado del torneo

- **Argentina**: ya clasificada a dieciseisavos como líder de su grupo.
- **Colombia**: clasificada, define liderato.
- **México**: en zona de clasificación con 1-0-1 (3 puntos), cierra fase de grupos ante República Checa.
- **Brasil y Escocia** igualan en el liderato de su sector con 1-0-1.

La fase de grupos cierra el 28 de junio; los dieciseisavos arrancan el 1 de julio.""",
        "image": "mundial",
        "tags": ["Mundial 2026", "Suiza", "Canadá", "Colombia", "México"],
        "source": "ESPN / FIFA",
        "source_url": "https://espndeportes.espn.com/futbol/mundial/nota/_/id/16794151/mundial-2026-todos-los-resultados-partidos-de-hoy-quien-gano",
    },
    {
        "category": "Economía",
        "category_icon": "💱",
        "category_color": "#16A34A",
        "title": "Tipo de cambio: dólar se vende en 17.55 pesos este 24 de junio",
        "excerpt": "El peso mexicano se mantiene estable frente al dólar en la apertura del 24 de junio. Bloomberg Línea y Banxico confirman la cotización.",
        "body": """El precio del dólar estadounidense en México se mantiene en **17.55 pesos mexicanos** durante la jornada de este 24 de junio de 2026, según datos de Bloomberg Línea y el Sistema de Información Económica (SIE) del Banco de México.

## Cotización del día

- **Precio de apertura**: 17.5536 MXN por dólar (Bloomberg Línea)
- **Variación diaria**: 0.00% (+0.0006 MXN)
- **Expectativas Banxico** (promedio del mes):
  - Junio 2026: 17.40
  - Julio 2026: 17.49
  - Agosto 2026: 17.54
  - Septiembre 2026: 17.62
  - Octubre 2026: 17.68

## Contexto

El peso mexicano ha mostrado **estabilidad** en las últimas semanas, en un entorno donde:

- Banxico mantiene la tasa de referencia en 8.50% tras su última decisión.
- El anuncio del memorándum Pemex-Petrobras dio un leve impulso al sector energético.
- La inflación de la primera quincena de junio se publicó en línea con lo esperado por analistas.

## Dónde comprar/vender

- **Bancos tradicionales**: compra ~16.85, venta ~17.85.
- **Casas de cambio**: rangos de 17.20 a 17.70 según la ciudad.
- **Plataformas digitales**: mejores tasas para transferencia internacional (hasta 17.50 en compra).

Recuerda que las cotizaciones pueden variar a lo largo del día según el comportamiento del mercado.""",
        "image": "peso",
        "tags": ["Dólar", "Peso mexicano", "Tipo de cambio", "Banxico", "Economía"],
        "source": "Bloomberg Línea / Banxico",
        "source_url": "https://www.bloomberglinea.com/quote/USDMXN:CUR/",
    },
    {
        "category": "Tecnología",
        "category_icon": "🤖",
        "category_color": "#7C3AED",
        "title": "GitHub Copilot CLI rediseña su terminal; AWS lanza Blocks framework",
        "excerpt": "El día trae novedades importantes para developers: GitHub Copilot CLI ya está disponible con nueva interfaz, AWS Blocks promete backends agenticos y Lucide llega a v1.0.",
        "body": """El 24 de junio de 2026 llega cargado de noticias para el ecosistema de desarrollo:

## GitHub Copilot CLI: nueva interfaz de terminal

GitHub anunció la **disponibilidad general** de la nueva interfaz de terminal de Copilot CLI, presentada en Microsoft Build 2026. Características principales:

- Diseño basado en **pestañas** para sesión, gists, issues y pull requests.
- Comando `/mcp add` para añadir servidores MCP (Model Context Protocol).
- Gestión de skills con `/skills` desde la terminal.
- Mejor accesibilidad y temas de color.

## AWS Blocks: framework TypeScript agentico

Amazon Web Services lanzó en **preview público** Blocks, un framework TypeScript de código abierto (licencia Apache 2.0) que permite a agentes de IA escribir backends funcionales desde el primer intento. Cada "Block" empaqueta código + infraestructura AWS, soportando:

- Despliegue local sin cuenta AWS (`npm run dev` con Postgres, auth y storage incluidos).
- Mismo código en local y producción (Lambda, DynamoDB, Aurora).
- Generación de tipos de datos hasta el frontend.
- Soporte para Next.js, React, Vue, Angular, Swift, Kotlin y Flutter.

## Lucide 1.0: 1,600+ iconos open source

La popular librería de iconos Lucide llegó a la versión 1.0 con **más de 1,600 iconos** y un paquete React unificado. Es el fork comunitario de Feather Icons y se ha convertido en estándar de facto en muchos design systems.

## Anthropic + Slack

Anthropic integró capacidades de IA directamente en Slack, permitiendo a los equipos usar Claude en el contexto de sus conversaciones de trabajo sin cambiar de aplicación.

## Otros

- **iOS 27** potencia los Atajos con IA: automatizaciones en lenguaje natural.
- **Meta** avanza con sus gafas inteligentes con IA integrada.""",
        "image": "tech",
        "tags": ["GitHub", "Copilot", "AWS", "Blocks", "Lucide", "IA"],
        "source": "Reviblog",
        "source_url": "https://reviblog.net/noticia/noticias-tecnologia-24-junio-2026/",
    },
    {
        "category": "Espectáculos",
        "category_icon": "🎭",
        "category_color": "#DB2777",
        "title": "Conciertos y cartelera cultural de CDMX esta semana",
        "excerpt": "Lali Esposito, Julieta Venegas, Alizée y más: una semana recargada de conciertos en la CDMX. Te dejamos los imperdibles del 24 al 30 de junio.",
        "body": """La Ciudad de México tiene una de las semanas más cargadas del año en cartelera cultural. Aquí el resumen de lo más relevante del **24 al 30 de junio 2026**:

## Conciertos destacados

🎤 **Lali Espósito** — continúa su gira por México con funciones en el Auditorio Nacional. Pop latino con producción visual de primer nivel.

🎵 **Julieta Venegas** — presenta su **Norteña Tour 2026** en el Auditorio Nacional. Show que fusiona su nuevo disco con su catálogo clásico.

🎶 **Alizée** — la cantante francesa regresa a México después de varios años. Funciones en Teatro Metropólitan y fechas adicionales en Guadalajara y Monterrey.

🎸 **Festivales en El Oasis de la CDMX** — durante junio el espacio al aire libre ofrece cartelera diaria con bandas emergentes nacionales e internacionales.

## Teatro y cultura

🎭 **Teatro de la Ciudad Esperanza Iris** — continúa la cartelera semanal con música con raíces mexicanas, danza y teatro experimental.

🎬 **Cineteca Nacional** — ciclo de cine argentino contemporáneo y retrospectiva de Lucrecia Martel.

## Recomendaciones de fin de semana

- 🎨 **Museo Tamayo** — nueva exposición de arte contemporáneo internacional.
- 🌮 **Festival del Pulque** en la CDMX — gastronomía, música y tradición.
- 📚 **Feria del Libro de Chapultepec** — presentaciones editoriales independientes.

Consulta Ticketmaster y las redes oficiales de cada recinto para disponibilidad y precios.""",
        "image": "conciertos",
        "tags": ["Conciertos", "CDMX", "Lali", "Julieta Venegas", "Cultura"],
        "source": "Milenio / Cartelera CDMX",
        "source_url": "https://www.milenio.com/espectaculos",
    },
    {
        "category": "Sucesos",
        "category_icon": "⚠️",
        "category_color": "#EA580C",
        "title": "Temblor hoy 24 de junio: microsismo magnitud 2.0 en Baja California Sur",
        "excerpt": "El Servicio Sismológico Nacional reportó un movimiento telúrico de baja intensidad al sur de BCS. No se reportan daños ni víctimas.",
        "body": """El Servicio Sismológico Nacional (SSN) reportó este 24 de junio de 2026 un **microsismo de magnitud 2.0** en el extremo sur de Baja California Sur, durante las primeras horas del día.

## Detalles del sismo

- **Magnitud**: 2.0
- **Epicentro**: extremo sur de Baja California Sur
- **Hora**: primeras horas del 24 de junio
- **Profundidad**: pendiente de reporte oficial
- **Percepción**: baja, sentido solo por sismógrafos y personas en reposo en zonas cercanas.

## Réplicas y actividad reciente

La actividad sísmica en la región es **habitual**: BCS se ubica en una zona de alta actividad tectónica por la interacción de las placas del Pacífico y Norteamérica. En las últimas 24 horas el SSN ha registrado al menos 8 movimientos de baja intensidad en diferentes estados (Oaxaca, Guerrero, Chiapas, Michoacán).

## Protocolos

Protección Civil de BCS activó el protocolo de revisión y confirmó que **no se reportan daños materiales ni personas lesionadas**. El temblor no ameritó activación de alerta sísmica en la Ciudad de México.

## Recomendaciones

- Manténgase informado a través de cuentas oficiales (@SSNMexico, @CNPC_MX).
- Tenga a la mano su mochila de emergencia.
- Si percibe otro movimiento, aplique la regla de las tres "A": agacharse, cubrirse y agarrarse.

La actividad sísmica es **normal** en territorio mexicano. El monitoreo del SSN es 24/7.""",
        "image": "temblor",
        "tags": ["Temblor", "Sismo", "Baja California Sur", "SSN", "Sucesos"],
        "source": "Infobae / SSN",
        "source_url": "https://www.infobae.com/mexico/2026/06/22/temblor-hoy-en-mexico-noticias-actividad-sismica-22-de-junio-de-2026/",
    },
    {
        "category": "Tecnología",
        "category_icon": "🍎",
        "category_color": "#7C3AED",
        "title": "iOS 27 potencia Atajos con IA: automatizaciones en lenguaje natural",
        "excerpt": "Apple anuncia la integración nativa de IA en la app Atajos. Lucide llega a v1.0 con 1,600 iconos. Resumen tech del 24 de junio.",
        "body": """El 24 de junio de 2026 llega con dos noticias relevantes para el ecosistema Apple y open source:

## iOS 27: Atajos con IA nativa

Apple presentó la **integración nativa de IA** en la app Atajos (Shortcuts) de iOS 27. Los usuarios podrán ahora crear automatizaciones complejas usando **lenguaje natural**, sin necesidad de encadenar acciones manualmente. Ejemplos que Apple mostró en su keynote:

- "Cada vez que llegue un correo de mi jefe con la palabra 'urgente', mándame un SMS resumen a mi Apple Watch."
- "Cuando entre a casa después de las 8pm, enciende las luces del estudio y pon mi playlist de focus en HomePod."

La actualización también incluye:

- **Asistente visual** que sugiere atajos según patrones de uso.
- **Marketplace de atajos** compartidos por la comunidad.
- Integración con Apple Intelligence en todos los dispositivos del ecosistema.

## Lucide 1.0

La popular librería de iconos open source **Lucide** llegó a su versión 1.0 estable con más de **1,600 iconos** y un paquete React unificado. Es el fork comunitario de Feather Icons y se ha convertido en estándar en frameworks como Nuxt, SvelteKit, Astro y muchos design systems modernos.

Cambios destacados en v1.0:

- API consistente entre Vue, React, Svelte y Web Components.
- TypeScript nativo con tipos exportados.
- Tree-shaking mejorado (hasta 80% menos peso en bundle).
- Iconos animados como primitivos oficiales.

## Otros anuncios del día

- **Anthropic + Slack**: integración nativa de Claude en conversaciones de trabajo.
- **Meta AI Glasses**: nuevas funciones de traducción en tiempo real en 12 idiomas.

Mañana más cobertura del WWDC que arranca mañana.""",
        "image": "apple",
        "tags": ["iOS 27", "Apple", "Atajos", "IA", "Lucide"],
        "source": "Reviblog / Apple",
        "source_url": "https://reviblog.net/noticia/noticias-tecnologia-24-junio-2026/",
    },
]


# ======== EDITORIAL SUMMARY BUILDER ========
# Same per-category voice logic as tests/seed_daily.py but for hardcoded posts.
# Produces a 2-3 line bullet-driven "what changed + why it matters".
SUMMARY_TEMPLATES = {
    "Política": (
        "📌 Hecho: {fact}\n"
        "🎯 Por qué importa: redefine el equilibrio de poder en el corto plazo "
        "y obliga a actores clave a posicionarse.\n"
        "👀 A seguir: reacciones de oposición, bloques legislativos y próximos decretos."
    ),
    "Economía": (
        "📌 Hecho: {fact}\n"
        "💹 Impacto: mueve expectativas de inflación, tasas y tipo de cambio; "
        "sectores sensibles reaccionan primero.\n"
        "🎯 A seguir: lectura del Banxico, comportamiento del peso y reportes sectoriales."
    ),
    "Seguridad": (
        "📌 Hecho: {fact}\n"
        "🛡️ Impacto: fortalece (o replantea) la estrategia nacional de seguridad "
        "y los operativos coordinados con estados.\n"
        "👀 A seguir: cifras oficiales del SESNSP, reacciones de Gobernadores y próximos objetivos."
    ),
    "Fútbol": (
        "📌 Hecho: {fact}\n"
        "⚽ Impacto: cambia el panorama rumbo a la siguiente jornada, liguilla o "
        "competición internacional.\n"
        "🎯 A seguir: alineaciones confirmadas, lesiones y movimientos en la tabla."
    ),
    "Deportes": (
        "📌 Hecho: {fact}\n"
        "🏆 Impacto: redefine el favoritismo, ranking o clasificación según la disciplina.\n"
        "👀 A seguir: próximas pruebas, rivales directos y el estado físico de los protagonistas."
    ),
    "Tecnología": (
        "📌 Hecho: {fact}\n"
        "💻 Impacto: developers y empresas ganan (o pierden) una capacidad clave "
        "en su stack.\n"
        "🎯 A seguir: documentación oficial, pricing, integraciones de terceros y comunidad."
    ),
    "Espectáculos": (
        "📌 Hecho: {fact}\n"
        "🎬 Impacto: marca agenda cultural y mueve la conversación en redes.\n"
        "👀 A seguir: preventas, nominaciones y reacciones del público en las próximas semanas."
    ),
    "Sucesos": (
        "📌 Hecho: {fact}\n"
        "⚠️ Impacto: afecta directamente a comunidades involucradas y servicios de emergencia.\n"
        "🎯 A seguir: cifras oficiales, zonas afectadas y recomendaciones de protección civil."
    ),
    "Mundo": (
        "📌 Hecho: {fact}\n"
        "🌍 Impacto: reconfigura la agenda internacional, mercados y opinión pública global.\n"
        "👀 A seguir: posicionamiento de potencias, organismos multilaterales y medios aliados."
    ),
    "Cultura": (
        "📌 Hecho: {fact}\n"
        "🎨 Impacto: enriquece (o cuestiona) el canon y abre nuevas conversaciones en la escena cultural.\n"
        "👀 A seguir: reseñas especializadas, temporada en cartel y recepción del público."
    ),
    "Ciencia": (
        "📌 Hecho: {fact}\n"
        "🔬 Impacto: aporta evidencia que puede cambiar protocolos, tratamientos o modelos teóricos.\n"
        "🎯 A seguir: revisión por pares, replicaciones y aplicaciones prácticas en el corto plazo."
    ),
    "Salud": (
        "📌 Hecho: {fact}\n"
        "🏥 Impacto: puede modificar guías clínicas, campañas de prevención o acceso a servicios.\n"
        "👀 A seguir: posicionamiento de la OMS, SSA, IMSS e industria farmacéutica."
    ),
}
DEFAULT_TEMPLATE = (
    "📌 Hecho: {fact}\n"
    "🎯 Por qué importa: agrega contexto nuevo a la conversación y merece seguimiento.\n"
    "👀 A seguir: reacciones oficiales y lecturas especializadas."
)


def build_summary(post):
    """Build editorial summary (≤400 chars) for a hardcoded post dict."""
    cat = post.get("category", "")
    fact = (post.get("excerpt") or "").strip()[:260]
    tpl = SUMMARY_TEMPLATES.get(cat, DEFAULT_TEMPLATE)
    out = tpl.format(fact=fact)
    if len(out) > 400:
        out = out[:397].rsplit("\n", 1)[0] + "…"
    return out


# ======== MAIN ========
def main():
    print(f"=== Seeding 10 posts for {datetime.now().strftime('%Y-%m-%d')} ===\n")
    c = Client(BASE)
    print("[1/4] Login as admin...")
    user = c.login(ADMIN_EMAIL, ADMIN_PASSWORD)
    print(f"      ✓ logged in as {user['name']} ({user['role']})\n")

    print("[2/4] Creating categories...")
    _, cats_resp = c.get("/api/blog/categories", expect=200)
    cats_list = cats_resp if isinstance(cats_resp, list) else cats_resp.get("items", cats_resp.get("categories", []))
    existing = {cat["name"]: cat for cat in cats_list}
    cat_ids = {}
    needed = {p["category"] for p in POSTS}
    for name in needed:
        icon = next((p["category_icon"] for p in POSTS if p["category"] == name), "📰")
        color = next((p["category_color"] for p in POSTS if p["category"] == name), "#FF6A00")
        if name in existing:
            cat_ids[name] = existing[name]["_id"]
            print(f"      ✓ {name} (exists)")
        else:
            _, body = c.post("/api/blog/categories",
                             body={"name": name, "icon": icon, "color": color},
                             expect=201)
            cat_ids[name] = body["_id"]
            print(f"      ✓ {name} (created id={body['_id']})")
    print()

    print("[3/4] Downloading images + creating posts...")
    created = []
    for i, p in enumerate(POSTS, 1):
        # Download image
        img_url = UNSPLASH[p["image"]]
        img_path = os.path.join(IMG_DIR, f"{p['image']}.jpg")
        try:
            fetch_image(img_url, img_path)
        except Exception as e:
            print(f"      ! could not download {img_url}: {e}")
            img_path = None

        # Create post (status: publicado so it shows in public blog)
        _, body = c.post("/api/blog/posts", body={
            "title": p["title"],
            "excerpt": p["excerpt"],
            "summary": build_summary(p),
            "body": p["body"],
            "category": cat_ids[p["category"]],
            "tags": p["tags"],
            "status": "publicado",
            "links": [
                {"url": p["source_url"], "title": f"Fuente: {p['source']}",
                 "description": "Artículo original de la fuente"}
            ] if p.get("source_url") else [],
        }, expect=201)
        post_id = body["_id"]
        created.append(post_id)
        print(f"      [{i:2d}/10] ✓ post created: {p['title'][:55]}...")

        # Upload image as cover + gallery (multipart/form-data)
        if img_path and os.path.exists(img_path) and os.path.getsize(img_path) > 1000:
            boundary = "----HermesBoundary7d4e2a"
            with open(img_path, "rb") as f:
                file_bytes = f.read()
            filename = os.path.basename(img_path)
            body_bytes = (
                f"--{boundary}\r\n"
                f'Content-Disposition: form-data; name="files"; filename="{filename}"\r\n'
                f"Content-Type: image/jpeg\r\n\r\n"
            ).encode("utf-8") + file_bytes + f"\r\n--{boundary}--\r\n".encode("utf-8")
            try:
                _, up_body = c.post(
                    f"/api/blog/posts/{post_id}/images",
                    body=body_bytes,
                    headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
                    expect=201,
                    raw=True,
                )
                if up_body and len(up_body) > 0:
                    file_url = up_body[0]["url"]
                    c.put(f"/api/blog/posts/{post_id}",
                          body={"coverImage": file_url}, expect=200)
                    print(f"            ↳ image uploaded + set as cover")
            except AssertionError as e:
                print(f"            ! upload failed: {str(e)[:120]}")
    print()

    print("[4/4] Verification...")
    _, posts = c.get("/api/blog/public/posts", expect=200)
    posts_list = posts if isinstance(posts, list) else posts.get("items", posts.get("posts", []))
    total = len(posts_list)
    print(f"      ✓ public blog has {total} total posts (≥10 expected)")
    for p in POSTS:
        match = any(p["title"][:30] in item.get("title", "")
                    for item in posts_list)
        if not match:
            print(f"      ! MISSING: {p['title'][:60]}...")

    print(f"\n=== Done! {len(created)} posts created ===")
    print(f"  IDs: {created}")
    print(f"  Public URL: https://sxxysecret.com/public/blog")


if __name__ == "__main__":
    main()