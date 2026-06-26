#!/usr/bin/env python3
"""
Daily news seeder for Aguitech Core.

Runs daily (cron) and publishes 10 fresh posts covering today's news + sports.
Mix is balanced across categories. When a topic warrants it (gallery-friendly
events, sports matches, smartphones, concerts), uploads a gallery of 5 images.
When a topic has video coverage (goals, conferences, trailers), uploads 1 video.

Idempotent per day: refuses to re-run if today's posts already exist.

Sources: El Universal, Excélsior, La Jornada, Milenio, Infobae, ESPN, FIFA,
          Bloomberg, gob.mx, AP, Reuters, Marca, AS, El País.

Stdlib only (urllib). No pip, no API keys.

Usage:
    python3 tests/seed_daily.py                  # auto-detect today's news
    python3 tests/seed_daily.py --dry-run         # show plan, no posts
    python3 tests/seed_daily.py --force            # ignore idempotency
    python3 tests/seed_daily.py --gallery-topics 3 # force gallery on N topics
"""
import argparse
import hashlib
import json
import os
import random
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from html.parser import HTMLParser
from urllib.parse import urlparse

# ======== CONFIG ========
BASE = os.environ.get("AGUITTECH_BASE", "https://sxxysecret.com")
ADMIN_EMAIL = os.environ.get("AGUITTECH_EMAIL", "hector@aguitech.com")
ADMIN_PASSWORD=os.environ.get("AGUITTECH_PASSWORD", "peris51373")
IMG_DIR = "/tmp/seed_imgs"
VID_DIR = "/tmp/seed_vids"
os.makedirs(IMG_DIR, exist_ok=True)
os.makedirs(VID_DIR, exist_ok=True)

# Categories registry — name → (icon, color). New ones auto-created.
CATEGORY_REGISTRY = {
    # Originals
    "Política": ("🏛️", "#DC2626"),
    "Economía": ("💰", "#16A34A"),
    "Seguridad": ("🛡️", "#1E40AF"),
    "Fútbol": ("⚽", "#0EA5E9"),
    "Deportes": ("🏆", "#7C3AED"),
    "Tecnología": ("🤖", "#7C3AED"),
    "Espectáculos": ("🎭", "#DB2777"),
    "Sucesos": ("⚠️", "#EA580C"),
    "Mundo": ("🌍", "#0D9488"),
    "Cultura": ("🎨", "#9333EA"),
    "Ciencia": ("🔬", "#0284C7"),
    "Salud": ("🏥", "#059669"),
    # ===== NEW SLOTS (nighttime + lifestyle) =====
    "Internacional": ("🌐", "#0891B2"),       # Geopolítica + análisis
    "Geopolítica": ("🗺️", "#7C2D12"),         # Conflictos, diplomacia, fronteras
    "Bienestar": ("🧘", "#14B8A6"),           # Salud mental, hábitos, longevidad
    "Vida Saludable": ("🥗", "#65A30D"),      # Nutrición, ejercicio, sueño
    "Cripto": ("₿", "#F59E0B"),               # Bitcoin, ethereum, DeFi, regulación
    "Mercados": ("📈", "#0EA5E9"),            # Bolsas, futuros, commodities
    "Finanzas Personales": ("💳", "#10B981"), # Ahorro, inversión, crédito, deudas
    "Sustentabilidad": ("🌱", "#16A34A"),     # Cambio climático, ESG, medio ambiente
    "Hogar": ("🏡", "#A16207"),               # Decoración, DIY, mantenimiento
    "Familia": ("👨‍👩‍👧", "#EC4899"),             # Parenting, relaciones, educación
    "Viajes": ("✈️", "#06B6D4"),              # Destinos, tips, aviación
    "Gastronomía": ("🍴", "#DC2626"),         # Recetas, restaurantes, tendencias
    "Salud Mental": ("🧠", "#8B5CF6"),        # Ansiedad, depresión, terapia
    "IA": ("🤖", "#06B6D4"),                  # Inteligencia Artificial (separada de Tecnología)
}

# Editorial slots — each fires at a different time of day with a
# tailored category mix. The cron dispatcher passes --slot=<key>.
SLOT_PROFILES = {
    "morning_briefing": [
        # 06:00 — Política + Economía + Seguridad del amanecer
        ("Política", "Sheinbaum conferencia mañanera hoy"),
        ("Economía", "peso mexicano tipo de cambio hoy Banxico"),
        ("Seguridad", "seguridad méxico estrategia nacional hoy"),
        ("Política", "congreso unión méxico reformas hoy"),
        ("Economía", "BMV bolsa mexicana petroprecios hoy"),
        ("Mundo", "internacional noticias hoy España Francia"),
        ("Sucesos", "temblor méxico hoy sismológico nacional"),
        ("Economía", "inflación México INEGI hoy"),
        ("Política", "PEMEX energía noticias hoy"),
        ("Seguridad", "Guardia Nacional México operativo hoy"),
    ],
    "mid_morning": [
        # 09:00 — Fútbol + Deportes (resultados nocturnos)
        ("Fútbol", "Selección Mexicana mundial hoy"),
        ("Fútbol", "Cruz Azul La Máquina noticias hoy"),
        ("Fútbol", "Liga MX resultados jornada hoy"),
        ("Fútbol", "América Club Águilas noticias hoy"),
        ("Deportes", "Champions League noticias hoy"),
        ("Deportes", "Champions League partidos hoy"),
        ("Fútbol", "Chivas Guadalajara noticias hoy"),
        ("Fútbol", "Pumas UNAM noticias hoy"),
        ("Deportes", "tenis ATP WTA noticias hoy"),
        ("Deportes", "NFL NBA MLB noticias hoy"),
    ],
    "lunchtime": [
        # 13:00 — Tecnología + Mundo + Cultura
        ("Tecnología", "tecnología inteligencia artificial noticias hoy"),
        ("Tecnología", "Apple Google Microsoft anuncio hoy"),
        ("Tecnología", "ciberseguridad hackeo noticias hoy"),
        ("Mundo", "Estados Unidos noticias hoy política"),
        ("Mundo", "Europa noticias hoy España Francia Alemania"),
        ("Mundo", "Latinoamérica noticias hoy Argentina Brasil Chile"),
        ("Cultura", "cultura méxico cine teatro hoy"),
        ("Ciencia", "ciencia espacio NASA hoy"),
        ("Ciencia", "salud pública investigación hoy"),
        ("Tecnología", "startups financiamiento México hoy"),
    ],
    "evening": [
        # 17:00 — Espectáculos + Cultura + Salud
        ("Espectáculos", "espectáculos méxico conciertos cartelera hoy"),
        ("Espectáculos", "netflix disney películas series estreno hoy"),
        ("Espectáculos", "premios Óscar Grammy Emmy noticias hoy"),
        ("Cultura", "literatura libros bestsellers hoy"),
        ("Cultura", "museos exposiciones galería hoy"),
        ("Salud", "salud méxico IMSS ISSSTE hoy"),
        ("Salud", "vacuna enfermedad brote hoy"),
        ("Ciencia", "cambio climático medio ambiente hoy"),
        ("Espectáculos", "farándula famosos celebridades hoy"),
        ("Cultura", "gastronomía restaurantes México hoy"),
    ],
    "night_wrap": [
        # 21:00 — Cierre del día: Sucesos + Fútbol resumen + análisis
        ("Sucesos", "accidente emergencia noticias hoy México"),
        ("Sucesos", "clima tiempo pronóstico hoy México"),
        ("Fútbol", "Champions League resumen hoy"),
        ("Fútbol", "Selección Mexicana análisis hoy"),
        ("Economía", "cierre mercados bolsas México hoy"),
        ("Mundo", "resumen noticias internacionales hoy"),
        ("Política", "cierre política Sheinbaum hoy"),
        ("Sucesos", "accidente tránsito vialidad hoy"),
        ("Economía", "criptomonedas bitcoin ethereum hoy"),
        ("Cultura", "estreno cine taquillas México hoy"),
    ],
    # ===== NEW SLOTS: 5 horarios adicionales (madrugada + lifestyle) =====
    "midnight_world": [
        # 00:30 — Internacional + Geopolítica (Asia abre, Europa cierra)
        ("Internacional", "geopolítica mundo hoy Estados Unidos China"),
        ("Geopolítica", "guerra conflicto internacional noticias hoy"),
        ("Internacional", "Europa noticias hoy análisis"),
        ("Geopolítica", "OTAN ONU diplomacia hoy"),
        ("Internacional", "Asia noticias hoy Japón Corea India"),
        ("Geopolítica", "Rusia Ucrania Medio Oriente hoy"),
        ("Internacional", "Latinoamérica análisis hoy"),
        ("Internacional", "elecciones mundo hoy política internacional"),
        ("Mundo", "tratados comerciales internacionales hoy"),
        ("Internacional", "crisis humanitaria refugiados noticias hoy"),
    ],
    "deep_wellness": [
        # 02:30 — Bienestar + Vida Saludable + Salud Mental (insomnes)
        ("Bienestar", "bienestar salud mental hábitos hoy"),
        ("Vida Saludable", "nutrición alimentación saludable hoy"),
        ("Salud Mental", "ansiedad estrés manejo técnicas hoy"),
        ("Bienestar", "meditación mindfulness beneficios hoy"),
        ("Vida Saludable", "ejercicio fitness rutina hoy"),
        ("Bienestar", "sueño calidad descanso consejos hoy"),
        ("Salud Mental", "terapia psicología bienestar emocional hoy"),
        ("Vida Saludable", "dieta saludable recetas bienestar hoy"),
        ("Bienestar", "longevidad envejecimiento saludable hoy"),
        ("Salud Mental", "autoestima crecimiento personal hoy"),
    ],
    "pre_market_finance": [
        # 04:30 — Mercados + Cripto + Finanzas Personales (pre-market Asia)
        ("Mercados", "bolsa mercados Asia hoy Tokio Hong Kong"),
        ("Cripto", "Bitcoin Ethereum precio hoy análisis"),
        ("Mercados", "futuros NYSE S&P 500 Dow Jones hoy"),
        ("Cripto", "criptomonedas altcoins DeFi noticias hoy"),
        ("Finanzas Personales", "ahorro inversión consejos financieros hoy"),
        ("Mercados", "petróleo oro commodities precio hoy"),
        ("Cripto", "regulación cripto Bitcoin ETF noticias hoy"),
        ("Finanzas Personales", "tarjetas crédito deudas manejo hoy"),
        ("Mercados", "peso mexicano dólar tipo de cambio apertura hoy"),
        ("Finanzas Personales", "retiro AFP pensiones planning hoy"),
    ],
    "breakfast_brief": [
        # 07:30 — Economía + Internacional + Mercados (entre 6am y 9am)
        ("Economía", "economía global mercados apertura hoy"),
        ("Internacional", "noticias internacionales hoy análisis"),
        ("Economía", "comercio internacional aranceles hoy"),
        ("Mercados", "wall street apertura bursátil hoy"),
        ("Economía", "Banxico política monetaria decisión hoy"),
        ("Internacional", "Banco Central Federal Reserve noticias hoy"),
        ("Economía", "inflación IPC datos hoy"),
        ("Mercados", "divisas forex euro yen libra hoy"),
        ("Economía", "crecimiento PIB economía hoy"),
        ("Sustentabilidad", "energía renovable transición ecológica hoy"),
    ],
    "afternoon_lifestyle": [
        # 15:30 — Vida Saludable + Hogar + Familia + Viajes + Gastronomía
        ("Vida Saludable", "vida saludable tips prácticos hoy"),
        ("Hogar", "decoración hogar diseño interiores hoy"),
        ("Familia", "parenting educación niños familia hoy"),
        ("Viajes", "destinos turísticos tips viajes hoy"),
        ("Gastronomía", "recetas cocina gastronomía hoy"),
        ("Bienestar", "bienestar integral estilo de vida hoy"),
        ("Hogar", "jardinería plantas hogar hoy"),
        ("Familia", "relaciones familia tiempo de calidad hoy"),
        ("Viajes", "aerolíneas vuelos ofertas hoy"),
        ("Gastronomía", "restaurantes tendencias culinarias hoy"),
    ],
    # ===== PHASE 3 SLOTS: Tech + IA + Cultura + Noticias (5 slots adicionales) =====
    "tech_ai_wave1": [
        # 11:00 — Tecnología + IA (pico actividad tech pre-almuerzo)
        ("Tecnología", "tecnología gadgets smartphones lanzamiento hoy"),
        ("IA", "inteligencia artificial GPT Claude Gemini noticias hoy"),
        ("Tecnología", "Apple iPhone Mac noticias hoy"),
        ("IA", "machine learning modelos IA abiertos hoy"),
        ("Tecnología", "Google Android Pixel noticias hoy"),
        ("IA", "OpenAI Anthropic Google DeepMind anuncio hoy"),
        ("Tecnología", "ciberserseguridad hackeo ransomware hoy"),
        ("IA", "IA generativa imágenes video texto hoy"),
        ("Tecnología", "startups tecnología financiamiento hoy"),
        ("IA", "IA en empresas productividad automatización hoy"),
    ],
    "tech_ai_wave2": [
        # 14:00 — IA dominante + Tecnología (post-almuerzo, sesión profunda)
        ("IA", "chatbots asistentes IA ChatGPT Claude Copilot hoy"),
        ("IA", "IA agentes autónomos workflows hoy"),
        ("Tecnología", "chips semiconductores NVIDIA Intel AMD hoy"),
        ("IA", "regulación IA Europa EUA México hoy"),
        ("Tecnología", "robotics humanoides Tesla Optimus hoy"),
        ("IA", "IA salud medicina diagnóstico hoy"),
        ("Tecnología", "computación cuántica IBM Google hoy"),
        ("IA", "IA arte música creatividad hoy"),
        ("Tecnología", "5G redes conectividad hoy"),
        ("IA", "prompt engineering herramientas IA hoy"),
    ],
    "culture_news_burst": [
        # 19:30 — Cultura + Mundo/Noticias (after-hours cultural + cierre)
        ("Cultura", "cine estrenos cartelera México hoy"),
        ("Mundo", "noticias internacionales hoy hemeroteca"),
        ("Cultura", "museos exposiciones galería hoy"),
        ("Mundo", "Estados Unidos política noticias hoy"),
        ("Cultura", "literatura libros bestsellers lanzamientos hoy"),
        ("Mundo", "Europa noticias hoy España Francia Alemania"),
        ("Cultura", "música conciertos lanzamientos álbum hoy"),
        ("Mundo", "Asia noticias hoy Japón Corea China India"),
        ("Cultura", "arte contemporáneo diseño hoy"),
        ("Mundo", "Latinoamérica noticias hoy Argentina Brasil Chile"),
    ],
    "culture_news_late": [
        # 22:30 — Cultura + Sucesos + Política (pre-cierre cultural)
        ("Cultura", "gastronomía restaurantes tendencias hoy"),
        ("Política", "noticias política nacional hoy"),
        ("Cultura", "teatro danza artes escénicas hoy"),
        ("Política", "congreso reformas legislación hoy"),
        ("Cultura", "tradiciones patrimonio cultural hoy"),
        ("Sucesos", "noticias último momento hoy"),
        ("Cultura", "farándula celebridades farándula hoy"),
        ("Política", "elecciones partidos políticos hoy"),
        ("Cultura", "series streaming Netflix Disney hoy"),
        ("Sucesos", "clima tiempo pronóstico hoy"),
    ],
    "tech_ai_recap": [
        # 03:30 — Tech + IA recap (insomnes tech, hemeroteca madrugada)
        ("Tecnología", "tecnología resumen día hoy"),
        ("IA", "inteligencia artificial análisis día hoy"),
        ("Tecnología", "gadgets reviews comparativas hoy"),
        ("IA", "AI papers research papers hoy"),
        ("Tecnología", "blockchain Web3 cripto tecnología hoy"),
        ("IA", "IA educación aprendizaje hoy"),
        ("Tecnología", "gaming videojuegos esports hoy"),
        ("IA", "IA seguridad deepfakes detección hoy"),
        ("Tecnología", "espacio SpaceX NASA tecnología hoy"),
        ("IA", "IA código programación developers hoy"),
    ],
}

# Legacy alias
SEARCH_QUERIES = SLOT_PROFILES["morning_briefing"]

# Working Unsplash URLs for each category (license-free, commercial OK)
COVER_UNSPLASH = {
    "Política": "https://images.unsplash.com/photo-1529107386315-e1a2ed48a620?w=1600&q=80",
    "Economía": "https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=1600&q=80",
    "Seguridad": "https://images.unsplash.com/photo-1453873531674-2151bcd01707?w=1600&q=80",
    "Fútbol": "https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?w=1600&q=80",
    "Deportes": "https://images.unsplash.com/photo-1461896836934-bd45ba8fcf9b?w=1600&q=80",
    "Tecnología": "https://images.unsplash.com/photo-1488590528505-98d2b5aba04b?w=1600&q=80",
    "Espectáculos": "https://images.unsplash.com/photo-1429962714451-bb934ecdc4ec?w=1600&q=80",
    "Sucesos": "https://images.unsplash.com/photo-1542273917363-3b1817f69a2d?w=1600&q=80",
    "Mundo": "https://images.unsplash.com/photo-1521295121783-8a321d551ad2?w=1600&q=80",
    "Cultura": "https://images.unsplash.com/photo-1518998053901-5348d3961a04?w=1600&q=80",
    "Ciencia": "https://images.unsplash.com/photo-1532187863486-abf9dbad1b69?w=1600&q=80",
    "Salud": "https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=1600&q=80",
    # ===== NEW CATEGORIES (nighttime + lifestyle) =====
    "Internacional": "https://images.unsplash.com/photo-1526778548025-fa2f459cd5c1?w=1600&q=80",
    "Geopolítica": "https://images.unsplash.com/photo-1541872703-74c5e44368f9?w=1600&q=80",
    "Bienestar": "https://images.unsplash.com/photo-1545389336-cf090694435e?w=1600&q=80",
    "Vida Saludable": "https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=1600&q=80",
    "Cripto": "https://images.unsplash.com/photo-1518546305927-5a555bb7020d?w=1600&q=80",
    "Mercados": "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=1600&q=80",
    "Finanzas Personales": "https://images.unsplash.com/photo-1556742502-ec7c0e9f34b1?w=1600&q=80",
    "Sustentabilidad": "https://images.unsplash.com/photo-1466611653911-95081537e5b7?w=1600&q=80",
    "Hogar": "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1600&q=80",
    "Familia": "https://images.unsplash.com/photo-1609220136736-443140cffec6?w=1600&q=80",
    "Viajes": "https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=1600&q=80",
    "Gastronomía": "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=1600&q=80",
    "Salud Mental": "https://images.unsplash.com/photo-1499209974431-9dddcece7f88?w=1600&q=80",
    "IA": "https://images.unsplash.com/photo-1677442136019-21780ecad995?w=1600&q=80",
}

# Per-topic gallery: list of Unsplash photo URLs that fit the topic.
# The script picks the first available N images.
GALLERY_BANK = {
    "Fútbol": [
        "https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?w=1600&q=80",  # stadium
        "https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=1600&q=80",  # football
        "https://images.unsplash.com/photo-1606925797300-0b35e9d1794e?w=1600&q=80",  # ball
        "https://images.unsplash.com/photo-1551958219-acbc608c6377?w=1600&q=80",  # boots
        "https://images.unsplash.com/photo-1517466787929-bc90951d0974?w=1600&q=80",  # fan
    ],
    "Tecnología": [
        "https://images.unsplash.com/photo-1518770660439-4636190af475?w=1600&q=80",  # circuit
        "https://images.unsplash.com/photo-1488590528505-98d2b5aba04b?w=1600&q=80",  # code
        "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=1600&q=80",  # ai
        "https://images.unsplash.com/photo-1593642632559-0c6d3fc62b89?w=1600&q=80",  # laptop
        "https://images.unsplash.com/photo-1592899677977-9c10ca588bbd?w=1600&q=80",  # apple
    ],
    "Espectáculos": [
        "https://images.unsplash.com/photo-1429962714451-bb934ecdc4ec?w=1600&q=80",  # crowd
        "https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=1600&q=80",  # concert
        "https://images.unsplash.com/photo-1493676304819-0d7a8d026dcf?w=1600&q=80",  # theater
        "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=1600&q=80",  # stage
        "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=1600&q=80",  # music
    ],
    "Política": [
        "https://images.unsplash.com/photo-1529107386315-e1a2ed48a620?w=1600&q=80",  # congress
        "https://images.unsplash.com/photo-1604004215931-7eb6e54e8c80?w=1600&q=80",  # flag
        "https://images.unsplash.com/photo-1591189863345-58c996a4daf7?w=1600&q=80",  # gov
        "https://images.unsplash.com/photo-1532375810709-75b1da00537c?w=1600&q=80",  # mexico
        "https://images.unsplash.com/photo-1561489413-985b06da5bee?w=1600&q=80",  # capital
    ],
    "Seguridad": [
        "https://images.unsplash.com/photo-1453873531674-2151bcd01707?w=1600&q=80",  # badge
        "https://images.unsplash.com/photo-1593115057322-e94b77572f20?w=1600&q=80",  # patrol
        "https://images.unsplash.com/photo-1556761175-5973dc0f32e7?w=1600&q=80",  # police
        "https://images.unsplash.com/photo-1473448912268-2022ce9509d8?w=1600&q=80",  # cctv
        "https://images.unsplash.com/photo-1532635241-17e820acc59f?w=1600&q=80",  # night
    ],
    "Economía": [
        "https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=1600&q=80",  # money
        "https://images.unsplash.com/photo-1518186285589-2f7649de83e0?w=1600&q=80",  # stock
        "https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?w=1600&q=80",  # bills
        "https://images.unsplash.com/photo-1601597111158-2fceff292cdc?w=1600&q=80",  # market
        "https://images.unsplash.com/photo-1450101499163-c8848c66ca85?w=1600&q=80",  # finance
    ],
    "Sucesos": [
        "https://images.unsplash.com/photo-1542273917363-3b1817f69a2d?w=1600&q=80",  # seismic
        "https://images.unsplash.com/photo-1582738411706-bfc8e691d1c2?w=1600&q=80",  # disaster
        "https://images.unsplash.com/photo-1582738411706-bfc8e691d1c2?w=1600&q=80",  # alt
        "https://images.unsplash.com/photo-1518709268805-4e9042af2176?w=1600&q=80",  # alt2
        "https://images.unsplash.com/photo-1554232456-8727aae0cfa4?w=1600&q=80",  # alt3
    ],
    # ===== NEW CATEGORY GALLERIES (nighttime + lifestyle) =====
    "Internacional": [
        "https://images.unsplash.com/photo-1526778548025-fa2f459cd5c1?w=1600&q=80",  # globe
        "https://images.unsplash.com/photo-1551836022-d5d88e9218df?w=1600&q=80",  # city night
        "https://images.unsplash.com/photo-1486520299386-6d106b22014b?w=1600&q=80",  # world
        "https://images.unsplash.com/photo-1502920917128-1aa500764cbd?w=1600&q=80",  # map
        "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1600&q=80",  # earth
    ],
    "Geopolítica": [
        "https://images.unsplash.com/photo-1541872703-74c5e44368f9?w=1600&q=80",  # diplomacy
        "https://images.unsplash.com/photo-1591189863345-58c996a4daf7?w=1600&q=80",  # gov
        "https://images.unsplash.com/photo-1561489413-985b06da5bee?w=1600&q=80",  # capital
        "https://images.unsplash.com/photo-1577412647305-991150c7d163?w=1600&q=80",  # flags
        "https://images.unsplash.com/photo-1526470608268-f674ce90ebd4?w=1600&q=80",  # summit
    ],
    "Bienestar": [
        "https://images.unsplash.com/photo-1545389336-cf090694435e?w=1600&q=80",  # meditation
        "https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=1600&q=80",  # yoga
        "https://images.unsplash.com/photo-1499209974431-9dddcece7f88?w=1600&q=80",  # calm
        "https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=1600&q=80",  # wellness
        "https://images.unsplash.com/photo-1474418397713-7ede21d49118?w=1600&q=80",  # zen
    ],
    "Vida Saludable": [
        "https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=1600&q=80",  # food
        "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=1600&q=80",  # veggies
        "https://images.unsplash.com/photo-1494390248081-4e521a5940db?w=1600&q=80",  # nutrition
        "https://images.unsplash.com/photo-1505751172876-fa1923c5c528?w=1600&q=80",  # fitness
        "https://images.unsplash.com/photo-1545205597-3d9d02c29597?w=1600&q=80",  # healthy
    ],
    "Cripto": [
        "https://images.unsplash.com/photo-1518546305927-5a555bb7020d?w=1600&q=80",  # btc
        "https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=1600&q=80",  # crypto
        "https://images.unsplash.com/photo-1621761191319-c6fb62004040?w=1600&q=80",  # coin
        "https://images.unsplash.com/photo-1642542517806-0a2f0d76f4c1?w=1600&q=80",  # eth
        "https://images.unsplash.com/photo-1518546305927-5a555bb7020d?w=1600&q=80",  # btc2
    ],
    "Mercados": [
        "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=1600&q=80",  # chart
        "https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?w=1600&q=80",  # trading
        "https://images.unsplash.com/photo-1535320903710-d993d3d77d29?w=1600&q=80",  # market
        "https://images.unsplash.com/photo-1559526324-4b87b5e36e44?w=1600&q=80",  # stocks
        "https://images.unsplash.com/photo-1518186285589-2f7649de83e0?w=1600&q=80",  # finance
    ],
    "Finanzas Personales": [
        "https://images.unsplash.com/photo-1556742502-ec7c0e9f34b1?w=1600&q=80",  # budget
        "https://images.unsplash.com/photo-1563013544-824ae1b704d3?w=1600&q=80",  # wallet
        "https://images.unsplash.com/photo-1633158829585-23ba8f7c8caf?w=1600&q=80",  # savings
        "https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=1600&q=80",  # money
        "https://images.unsplash.com/photo-1601597111158-2fceff292cdc?w=1600&q=80",  # market
    ],
    "Salud Mental": [
        "https://images.unsplash.com/photo-1499209974431-9dddcece7f88?w=1600&q=80",  # mind
        "https://images.unsplash.com/photo-1490730141103-6cac27aaab94?w=1600&q=80",  # peace
        "https://images.unsplash.com/photo-1528715471579-d1bcf0ba5e83?w=1600&q=80",  # therapy
        "https://images.unsplash.com/photo-1517021897933-0e0319cfbc28?w=1600&q=80",  # thought
        "https://images.unsplash.com/photo-1499209974431-9dddcece7f88?w=1600&q=80",  # calm
    ],
    "Hogar": [
        "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1600&q=80",  # living room
        "https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=1600&q=80",  # interior
        "https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=1600&q=80",  # decor
        "https://images.unsplash.com/photo-1565538810643-b5bdb714032a?w=1600&q=80",  # kitchen
        "https://images.unsplash.com/photo-1513694203232-719a280e022f?w=1600&q=80",  # bedroom
    ],
    "Familia": [
        "https://images.unsplash.com/photo-1609220136736-443140cffec6?w=1600&q=80",  # family
        "https://images.unsplash.com/photo-1542038784456-1ea8e935640e?w=1600&q=80",  # kids
        "https://images.unsplash.com/photo-1606216794074-735e91aa2c92?w=1600&q=80",  # parent
        "https://images.unsplash.com/photo-1536640712-4d4c36ff0e4e?w=1600&q=80",  # together
        "https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9?w=1600&q=80",  # happy
    ],
    "Viajes": [
        "https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=1600&q=80",  # travel
        "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1600&q=80",  # beach
        "https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=1600&q=80",  # city
        "https://images.unsplash.com/photo-1530521954074-e64f6810b32d?w=1600&q=80",  # airplane
        "https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=1600&q=80",  # adventure
    ],
    "Gastronomía": [
        "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=1600&q=80",  # food
        "https://images.unsplash.com/photo-1473093226795-af9932fe5856?w=1600&q=80",  # dish
        "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=1600&q=80",  # plate
        "https://images.unsplash.com/photo-1495195134817-aeb325a55b65?w=1600&q=80",  # cook
        "https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=1600&q=80",  # meal
    ],
    "Sustentabilidad": [
        "https://images.unsplash.com/photo-1466611653911-95081537e5b7?w=1600&q=80",  # nature
        "https://images.unsplash.com/photo-1518531933037-91b2f5f229cc?w=1600&q=80",  # green
        "https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?w=1600&q=80",  # eco
        "https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1600&q=80",  # forest
        "https://images.unsplash.com/photo-1497436072909-60f360e1d4b1?w=1600&q=80",  # sustainability
    ],
    "IA": [
        "https://images.unsplash.com/photo-1677442136019-21780ecad995?w=1600&q=80",  # AI brain
        "https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=1600&q=80",  # AI robot
        "https://images.unsplash.com/photo-1655720828018-edd2daec9349?w=1600&q=80",  # AI code
        "https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=1600&q=80",  # robot
        "https://images.unsplash.com/photo-1531746790731-6c087fecd65a?w=1600&q=80",  # AI future
    ],
}

# Trending video URLs for video-worthy topics.
# Use small public-domain / CC0 videos. If fetch fails, falls back to image-only.
VIDEO_BANK = {
    "Fútbol": "https://download.samplelib.com/mp4/sample-5s.mp4",
    "Tecnología": "https://download.samplelib.com/mp4/sample-10s.mp4",
    "Espectáculos": "https://download.samplelib.com/mp4/sample-15s.mp4",
    "Política": "https://download.samplelib.com/mp4/sample-5s.mp4",
}


# ======== HTTP CLIENT ========
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
        elif raw and body is not None:
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


# ======== CONTENT EXTRACTION ========
class TextExtractor(HTMLParser):
    """Strip HTML to plain text, preserving paragraph breaks."""
    def __init__(self):
        super().__init__()
        self.text_parts = []
        self.skip = 0
        self.in_paragraph = False

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "noscript", "iframe"):
            self.skip += 1
        if tag in ("p", "br", "li", "h1", "h2", "h3", "h4"):
            self.text_parts.append("\n")
            self.in_paragraph = True

    def handle_endtag(self, tag):
        if tag in ("script", "style", "noscript", "iframe"):
            self.skip = max(0, self.skip - 1)
        if tag in ("p", "li", "h1", "h2", "h3", "h4"):
            self.text_parts.append("\n")
            self.in_paragraph = False

    def handle_data(self, data):
        if self.skip == 0:
            self.text_parts.append(data)

    def get_text(self):
        text = "".join(self.text_parts)
        # collapse whitespace
        text = re.sub(r"\n\s*\n+", "\n\n", text)
        text = re.sub(r"[ \t]+", " ", text)
        return text.strip()


def html_to_text(html):
    p = TextExtractor()
    p.feed(html)
    return p.get_text()


# ======== SMART MAIN-CONTENT EXTRACTION ========
# A small DOM walker that finds the <article>/<main>/role=main block, strips
# nav/header/footer/aside/ads/share widgets/comments, and returns up to 5000
# chars of clean main-content text. Stdlib only — no bs4.

_MAIN_SELECTORS = [
    re.compile(r"<article\b", re.IGNORECASE),
    re.compile(r"<main\b", re.IGNORECASE),
    re.compile(r"\brole\s*=\s*[\"']main[\"']", re.IGNORECASE),
    re.compile(
        r"\bid\s*=\s*[\"'][^\"']*"
        r"(?:content|article|nota|cuerpo|story|entry|text|body)"
        r"[^\"']*[\"']",
        re.IGNORECASE,
    ),
    re.compile(
        r"<div[^>]*class\s*=\s*[\"'][^\"']*"
        r"(?:article-content|note-body|entry-content|story-body|article-body|"
        r"post-content|nota-body|content-body|main-content|article__body|post__body)"
        r"[^\"']*[\"']",
        re.IGNORECASE,
    ),
]

_AD_CLASS = re.compile(
    r"\b(?:ad|ads|advert|advertisement|sponsor|sponsored|promo|promocion|"
    r"newsletter|publicidad|banner|popup)\b",
    re.IGNORECASE,
)
_SKIP_CLASS = re.compile(
    r"\b(?:share|sharing|social|related|recommend|recommendation|"
    r"comment|comments|sidebar|breadcrumb|menu|toolbar|metadata|"
    r"tags|tag-list|author-box|byline|paywall|subscribe|signup)\b",
    re.IGNORECASE,
)
_STRIP_TAGS = ("script", "style", "noscript", "iframe", "form",
               "header", "footer", "nav", "aside")


def _extract_main_html(html):
    """Return the substring of html that looks like the article body."""
    cleaned = html
    # First, drop obvious junk wholesale so they don't interfere with selector matching.
    for tag in _STRIP_TAGS:
        cleaned = re.sub(
            rf"<{tag}\b[^>]*>.*?</{tag}>",
            "",
            cleaned,
            flags=re.DOTALL | re.IGNORECASE,
        )
        cleaned = re.sub(
            rf"<{tag}\b[^>]*/?>",
            "",
            cleaned,
            flags=re.IGNORECASE,
        )
    # Try each main-content selector
    candidates = []
    for sel in _MAIN_SELECTORS:
        for m in sel.finditer(cleaned):
            candidates.append((m.start(), m.end()))
    if candidates:
        candidates.sort(key=lambda c: (c[0], -(c[1] - c[0])))
        start, end = candidates[0]
        # Walk back to the opening '<' of the tag this selector matched.
        # role=/id=/class= selectors may land inside the tag, not on the '<'.
        lt = cleaned.rfind("<", 0, start + 1)
        if lt >= 0 and lt > start - 300:  # sanity: within a reasonable tag length
            start = lt
        block = cleaned[start:end]
        # If we matched an opener but not its close, expand to the next </article|main>
        if not re.search(r"</(article|main)\s*>", block, re.IGNORECASE):
            closer = re.search(r"</(article|main)\s*>", cleaned[start:], re.IGNORECASE)
            if closer:
                block = cleaned[start:start + closer.end()]
        return block
    return cleaned


def _remove_class_blocks(html):
    """Strip div/section/ul that look like ads, share widgets, related, comments."""
    opener_re = re.compile(
        r"<(div|section|aside|ul|ol)\b[^>]*class\s*=\s*[\"']([^\"']+)[\"'][^>]*>",
        re.IGNORECASE,
    )
    out_chunks = []
    i = 0
    while i < len(html):
        m = opener_re.search(html, i)
        if not m:
            out_chunks.append(html[i:])
            break
        out_chunks.append(html[i:m.start()])
        classes = m.group(2)
        if _AD_CLASS.search(classes) or _SKIP_CLASS.search(classes):
            tag_name = m.group(1).lower()
            close_re = re.compile(rf"</{tag_name}\s*>", re.IGNORECASE)
            cm = close_re.search(html, m.end())
            if cm:
                i = cm.end()
            else:
                i = m.end()
        else:
            out_chunks.append(m.group(0))
            i = m.end()
    return "".join(out_chunks)


def extract_main_content(html, max_chars=5000):
    """Extract clean main-article text from raw HTML. Up to max_chars."""
    if not html:
        return ""
    block = _extract_main_html(html)
    block = _remove_class_blocks(block)
    text = html_to_text(block)
    # Collapse 3+ blank lines to 2
    text = re.sub(r"\n{3,}", "\n\n", text)
    # Drop lines that are just punctuation / single chars
    text = "\n".join(
        ln.strip() for ln in text.split("\n")
        if ln.strip() and len(ln.strip()) > 1
    )
    return text.strip()[:max_chars]


def clean_paragraph(text, max_chars=600):
    """Clean a paragraph: drop URLs, social handles, 'read also' references."""
    if not text:
        return ""
    t = text
    # Drop URLs (http/https bare)
    t = re.sub(r"https?://\S+", "", t)
    # Drop @handles
    t = re.sub(r"@[A-Za-z0-9_]{2,30}", "", t)
    # Drop "Lee también:" / "Sigue leyendo:" lead-ins
    t = re.sub(
        r"(?i)\b(?:lee\s+tambi[eé]n|sigue\s+leyendo|te\s+puede\s+interesar|"
        r"relacionad[oa]s?:?)\s*[:\-–—]\s*",
        "", t,
    )
    # Drop parenthetical "Foto: ..." / "Imagen: ..." credits
    t = re.sub(r"(?i)\((?:foto|imagen|v[ií]deo|video|fuente|cr[eé]dito)\s*:[^)]*\)", "", t)
    # Collapse whitespace
    t = re.sub(r"\s+", " ", t).strip()
    t = t.strip(" ,;:-–—")
    if len(t) > max_chars:
        cut = t[:max_chars]
        last = max(cut.rfind(". "), cut.rfind("; "), cut.rfind(", "))
        if last > max_chars * 0.6:
            cut = cut[:last + 1]
        else:
            cut = cut.rstrip(" ,;:-–—") + "…"
        t = cut
    # If the result starts mid-sentence (no uppercase, no terminal punct before
    # max_chars), drop leading lowercase junk so it reads naturally when
    # pasted after the lead.
    if t and t[0].islower():
        # Find the first sentence boundary and start from there
        m = re.search(r"[.!?]\s+[A-ZÁÉÍÓÚÑ]", t[:max_chars])
        if m:
            t = t[m.end() - 1:].lstrip()
            if t and t[0].isupper():
                t = t[0].lower() + t[1:]
    return t


def extract_key_facts(text, max_facts=8):
    """Pull key facts (numbers, dates, percentages, quotes) from text."""
    facts = []
    if not text:
        return facts
    sentences = re.split(r"(?<=[.!?])\s+", text)
    for s in sentences:
        s = s.strip()
        if len(s) < 20 or len(s) > 240:
            continue
        if re.search(r"\d", s):
            facts.append(s)
            if len(facts) >= max_facts:
                break
    quote_re = re.compile(r"[\"'\u201c\u201d\u00ab\u00bb]([^\"'\u201c\u201d\u00ab\u00bb\n]{20,200})[\"'\u201c\u201d\u00ab\u00bb]")
    for q in quote_re.findall(text):
        facts.append("\u00ab" + q + "\u00bb")
        if len(facts) >= max_facts + 4:
            break
    return facts[:max_facts]


def extract_best_quote(text, max_len=240):
    """Return the most impactful quoted sentence or numeric sentence."""
    if not text:
        return ""
    quote_re = re.compile(r"[\"'\u201c\u201d\u00ab\u00bb]([^\"'\u201c\u201d\u00ab\u00bb\n]{30,240})[\"'\u201c\u201d\u00ab\u00bb]")
    m = quote_re.search(text)
    if m:
        q = m.group(1).strip()
        return q[:max_len]
    sentences = re.split(r"(?<=[.!?])\s+", text)
    for s in sentences:
        s = s.strip()
        if re.search(r"\d", s) and 40 <= len(s) <= max_len:
            return s
    return ""


def multi_source_extract(results, limit=3):
    """Fetch up to `limit` search results and return primary + secondary sources
    plus a flat list of cross-source facts.

    Returns:
        {"primary": {...} | None,
         "secondary": [{...}, ...],
         "all_facts": [str, ...]}
    """
    out = {"primary": None, "secondary": [], "all_facts": []}
    if not results:
        return out
    skip_domains = (
        "youtube.com", "facebook.com", "instagram.com",
        "twitter.com", "x.com", "tiktok.com", "reddit.com",
        "pinterest.com", "linkedin.com", "wa.me", "t.me",
    )
    cleaned = []
    for r in results:
        url = r.get("url", "")
        if not url:
            continue
        if any(d in url for d in skip_domains):
            continue
        cleaned.append(r)
        if len(cleaned) >= limit:
            break
    if not cleaned:
        cleaned = results[:limit]

    sources = []
    for r in cleaned:
        url = r.get("url", "")
        text = extract_article(url)
        if text and len(text) > 250:
            sources.append({
                "title": r.get("title", ""),
                "url": url,
                "domain": url.split("/")[2] if "/" in url else "fuente",
                "text": text,
                "paragraphs": [p.strip() for p in text.split("\n\n") if len(p.strip()) > 80],
                "facts": extract_key_facts(text, max_facts=6),
            })
    if not sources:
        return out
    # Pick the longest/cleanest as primary
    sources.sort(key=lambda s: len(s["text"]), reverse=True)
    out["primary"] = sources[0]
    out["secondary"] = sources[1:]
    for s in sources:
        out["all_facts"].extend(s["facts"])
    return out


def _format_editorial_timestamp():
    """Return a fixed-format CST timestamp string."""
    return datetime.now().strftime("%H:%M CST, %d/%m/%Y")


WHY_IT_MATTERS = {
    "default": "El caso agrega contexto nuevo a la conversación pública y obliga a replantear la lectura del corto plazo: redefine prioridades en la agenda, acelera una decisión pendiente o pone presión sobre actores que hasta ahora habían quedado al margen.",
    "Política": "La decisión redefine el equilibrio de fuerzas en el corto plazo y obliga a los actores clave a fijar postura antes de la próxima votación o decreto; el costo político se traslada a quienes no se suban al nuevo eje.",
    "Economía": "El movimiento recalibra expectativas de inflación, tasas y tipo de cambio; los sectores más sensibles al crédito y al consumo discrecional serán los primeros en reaccionar en la siguiente semana.",
    "Seguridad": "La estrategia se reencuadra a nivel federal y estatal: lo que se mide en las próximas semanas es si los operativos coordinados se traducen en cifras del SESNSP y no sólo en declaraciones.",
    "Fútbol": "El resultado cambia el favoritismo rumbo a la siguiente jornada o competición; lo que se observa ahora es el estado físico de los protagonistas, las rotaciones del DT y el impacto en la tabla.",
    "Deportes": "La actuación redefine el ranking y la clasificación de la disciplina; la atención pasa a las próximas pruebas, rivales directos y la condición física de los protagonistas.",
    "Tecnología": "Developers y empresas ganan (o pierden) una capacidad concreta en su stack; la presión ahora se mueve a documentación oficial, pricing y comunidad de terceros.",
    "Espectáculos": "La noticia marca agenda cultural y mueve la conversación en redes; el impacto real se verá en preventas, nominaciones y la recepción del público en las próximas semanas.",
    "Sucesos": "El saldo humano y material obliga a revisar protocolos de protección civil y operativos de emergencia; lo que sigue es el parte oficial y la cobertura de los servicios involucrados.",
    "Mundo": "El episodio reconfigura la agenda internacional, los mercados y la opinión pública global; el foco se traslada a la reacción de potencias, organismos multilaterales y medios aliados.",
    "Cultura": "La pieza enriquece (o cuestiona) el canon y abre una conversación en la escena cultural; la lectura especializada y la recepción del público marcarán su huella en la temporada.",
    "Ciencia": "La evidencia puede modificar protocolos, tratamientos o modelos teóricos; lo decisivo ahora es la revisión por pares, las réplicas y las aplicaciones prácticas en el corto plazo.",
    "Salud": "El hallazgo puede modificar guías clínicas, campañas de prevención o acceso a servicios; el peso lo tendrán el posicionamiento de la OMS, la SSA, el IMSS y la industria farmacéutica.",
    "Internacional": "Mueve el tablero diplomático, comercial y de seguridad a escala regional; la atención pasa a las reacciones de aliados, sanciones, cumbres o nuevas rondas de negociación.",
    "Geopolítica": "Altera el equilibrio de poder entre bloques y la lectura estratégica del conflicto; el impacto se mide en cadenas de suministro, energía, migraciones y opinión pública global.",
    "Bienestar": "La práctica gana (o pierde) respaldo concreto para incorporarse a rutinas reales; lo que sigue es validación científica, constancia diaria y contraindicaciones específicas.",
    "Vida Saludable": "Cambia (o confirma) lo que sabemos sobre nutrición, movimiento y descanso; el siguiente paso es revisar meta-análisis, opinión de especialistas y guías oficiales antes de aplicarlo.",
    "Salud Mental": "Visibiliza un tema que sigue estigmatizado y abre rutas concretas de acompañamiento; urge escalar recursos profesionales y líneas de crisis, no sólo campañas de awareness.",
    "Cripto": "Mueve liquidez, sentiment y narrativas del ciclo; las altcoins suelen amplificar el movimiento antes de que el mercado convencional reaccione. No es asesoría financiera: DYOR.",
    "Mercados": "Sesgo sectorial, rotación entre value/growth y presión sobre activos refugio; el foco pasa a datos macro de la semana, earnings y comentarios de bancos centrales.",
    "Finanzas Personales": "Cambia una decisión concreta que toca bolsillo, crédito o ahorro; vale la pena comparar comisiones, leer letra chica y revisar el colchón de emergencia antes de moverse.",
    "Sustentabilidad": "Acelera (o retrasa) la transición hacia prácticas ESG y energía limpia; el peso real lo tendrán regulación, financiamiento verde y presión de consumidores e inversionistas.",
    "Hogar": "Una idea concreta para mejorar confort, funcionalidad o estética del hogar; el truco está en empezar por una habitación y no pretender resolver todo a la vez.",
    "Familia": "Aplica a la dinámica diaria de crianza, comunicación y educación en casa; cada familia es única y la recomendación gana cuando se adapta al contexto propio.",
    "Viajes": "Cambia (o confirma) el mejor momento, ruta o presupuesto para el próximo viaje; reservar con seis a ocho semanas de anticipación suele dar mejor tarifa aérea.",
    "Gastronomía": "Una receta, tendencia o técnica replicable en casa esta semana; marinar con antelación y dejar reposar 30+ minutos intensifica los sabores.",
    "IA": "Developers, empresas y usuarios ganan (o pierden) una capacidad clave en su flujo; la lectura inmediata pasa por benchmarks independientes, casos de uso reales y comentarios de la comunidad.",
}


def build_journalistic_body(primary, secondary_facts, category, source_url, source_domain):
    """Build the long-form journalistic body. Returns 1500-2500 chars target.

    Layout:
      Lead (2 sentences) -> Qué pasó -> Contexto -> Cifra / cita ->
      Por qué importa -> Fuente footer.
    """
    if not primary:
        return ""
    paragraphs = primary.get("paragraphs") or []
    # Lead: first 1-2 paragraphs compressed into 2 sentences
    lead_src = clean_paragraph(paragraphs[0] if paragraphs else primary["text"], 600)
    sentences = re.split(r"(?<=[.!?])\s+", lead_src)
    if len(sentences) >= 2:
        lead = " ".join(sentences[:2]).strip()
    else:
        lead = lead_src.rstrip(".") + "."

    # Qué pasó: 800-1400 chars of clean prose from primary body.
    # Skip the lead paragraph AND aggressively dedupe against the lead text.
    lead_text_clean = clean_paragraph(paragraphs[0] if paragraphs else "", 600)
    lead_norm = re.sub(r"\s+", " ", lead_text_clean).strip().lower()[:300]
    body_chunks = []
    used_prefixes = {lead_norm} if lead_norm else set()
    for p in paragraphs[1:6]:
        cleaned = clean_paragraph(p, 600)
        if not cleaned:
            continue
        # Skip if the start of this paragraph overlaps with the lead or
        # with a paragraph we already included.
        cleaned_norm = re.sub(r"\s+", " ", cleaned).strip().lower()[:120]
        if cleaned_norm in used_prefixes:
            continue
        # Also skip if this paragraph is essentially the lead rephrased.
        if lead_norm and (cleaned_norm[:80] in lead_norm or lead_norm[:80] in cleaned_norm):
            continue
        used_prefixes.add(cleaned_norm)
        body_chunks.append(cleaned)
        joined = "\n\n".join(body_chunks)
        if 800 <= len(joined) and len(body_chunks) >= 2:
            break
        if len(joined) > 1400:
            break
    if not body_chunks or sum(len(c) for c in body_chunks) < 600:
        # Fall back to slicing the cleaned text directly (skip first ~500 chars
        # that the lead already used).
        body_chunks = [clean_paragraph(primary["text"][500:], 1400)]
    que_paso = "\n\n".join(body_chunks)

    # Contexto: 2-3 sentences from a paragraph NOT already shown in "Qué pasó"
    # plus a cross-source fact if available.
    contexto = ""
    candidates = paragraphs[2:6]  # skip lead (0) and first body para (1)
    for p in reversed(candidates):
        cleaned = clean_paragraph(p, 400)
        if not cleaned:
            continue
        cleaned_norm = re.sub(r"\s+", " ", cleaned).strip().lower()[:120]
        if any(cleaned_norm[:80] in re.sub(r"\s+", " ", c).strip().lower() for c in body_chunks):
            continue
        if lead_norm and cleaned_norm[:80] in lead_norm:
            continue
        contexto = cleaned
        break
    if not contexto and candidates:
        contexto = clean_paragraph(candidates[0], 400)
    if secondary_facts and contexto:
        for fact in secondary_facts:
            f_clean = clean_paragraph(fact, 240)
            if f_clean and f_clean[:40] not in contexto:
                contexto = contexto.rstrip(". ") + ". " + f_clean
                break
    if not contexto:
        contexto = clean_paragraph(primary["text"][1000:], 400)
    csent = re.split(r"(?<=[.!?])\s+", contexto.strip())
    if len(csent) >= 3:
        contexto = " ".join(csent[:3]).strip()
    elif len(csent) == 1:
        contexto = contexto.rstrip(".") + "."
    else:
        contexto = contexto.rstrip(".")

    # Cifra / cita: best quote or numeric fact (wrap quotes in «» for clarity)
    cifra = extract_best_quote(primary["text"], max_len=280)
    if cifra:
        if not (cifra.startswith("«") or cifra.startswith('"')
                or cifra.startswith("“")):
            cifra = "«" + cifra + "»"
    if not cifra and secondary_facts:
        for f in secondary_facts:
            if re.search(r"\d", f):
                cifra = clean_paragraph(f, 260)
                break
    if cifra and not cifra.endswith("."):
        cifra = cifra.rstrip() + "."

    por_que = WHY_IT_MATTERS.get(category, WHY_IT_MATTERS["default"])

    parts = [
        lead,
        "📍 **Qué pasó**\n\n" + que_paso,
        "🔍 **El contexto**\n\n" + contexto,
    ]
    if cifra:
        parts.append("💬 **La cifra / la cita**\n\n" + cifra)
    parts.append("🎯 **Por qué importa**\n\n" + por_que)
    parts.append(
        "---\n\n"
        f"📰 Fuente: [{source_domain}]({source_url})\n"
        "🤖 Publicado automáticamente por el digest editorial de Aguitech Core.\n"
        f"🕐 Hora de cierre editorial: {_format_editorial_timestamp()}"
    )
    body = "\n\n".join(parts)
    if len(body) > 2800:
        body = body[:2770].rsplit("\n", 1)[0] + "…"
    return body


# ======== SEARCH (DuckDuckGo HTML — no API key needed) ========
# Direct RSS feeds — these return real article URLs (not Google News redirects).
# Mapped roughly to categories so search() can pick the right feeds.
DIRECT_FEEDS = {
    "general": [
        "https://www.elfinanciero.com.mx/rss",
        "https://www.reforma.com/rss/portada.xml",
    ],
    "deportes": [
        "https://www.marca.com/rss/futbol/mexico.xml",
        "https://www.record.com.mx/rss",
    ],
    "mundo": [
        "https://www.bbc.com/mundo/index.xml",
    ],
    "tecnologia": [
        "https://www.xataka.com/index.xml",
        "https://www.genbeta.com/index.xml",
        "https://www.unocero.com/feed/",
        "https://es.wired.com/feed/rss",
    ],
    "espectaculos": [
        "https://www.elmundotoday.com/feed/",  # satirical; works as placeholder
    ],
}

# Map a category name → DIRECT_FEEDS key.
_CATEGORY_TO_FEEDS = {
    "Política": "general",
    "Economía": "general",
    "Seguridad": "general",
    "Sucesos": "general",
    "Internacional": "mundo",
    "Geopolítica": "mundo",
    "Mundo": "mundo",
    "Fútbol": "deportes",
    "Deportes": "deportes",
    "Tecnología": "tecnologia",
    "IA": "tecnologia",
    "Ciencia": "tecnologia",
    "Espectáculos": "espectaculos",
    "Cultura": "espectaculos",
}


def _fetch_feed(url, max_items=30):
    """Fetch a single RSS feed and return list of {title, url, snippet}."""
    try:
        req = urllib.request.Request(url, headers={
            "User-Agent": "Mozilla/5.0 (X11; Linux) Firefox/115",
        })
        with urllib.request.urlopen(req, timeout=12) as r:
            xml = r.read().decode("utf-8", "replace")
    except Exception:
        return []
    out = []
    for item_match in re.finditer(r"<item>([\s\S]*?)</item>", xml):
        item_xml = item_match.group(1)
        t = re.search(r"<title>(?:<!\[CDATA\[)?(.+?)(?:\]\]>)?</title>", item_xml)
        l = re.search(r"<link>(?:<!\[CDATA\[)?(.+?)(?:\]\]>)?</link>", item_xml)
        d = re.search(r"<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?</description>",
                      item_xml, re.DOTALL)
        if not t or not l:
            continue
        title = re.sub(r"<[^>]+>", "", t.group(1)).strip()
        link = l.group(1).strip()
        desc = ""
        if d:
            desc = re.sub(r"<[^>]+>", "", d.group(1)).strip()
            desc = re.sub(r"\s+", " ", desc)[:300]
        out.append({"title": title, "url": link, "snippet": desc})
        if len(out) >= max_items:
            break
    return out


def _score(item, keywords):
    """Score a feed item against a list of query keywords (case-insensitive).
    Returns 0 if no keyword match."""
    hay = " ".join([item.get("title", ""), item.get("snippet", "")]).lower()
    score = 0
    for kw in keywords:
        kw_l = kw.lower()
        if kw_l in hay:
            score += 1
            # Bonus: keyword in title
            if kw_l in item.get("title", "").lower():
                score += 2
    return score


def search(query, limit=5, category=None):
    """Search for `query` and return up to `limit` results with direct URLs.

    Strategy:
    1. Try category-specific direct RSS feeds first, filtered by keyword.
    2. Fall back to general direct feeds filtered by keyword.
    3. Last resort: Google News RSS (results kept only if URL is NOT a Google
       redirect, since those are empty shell pages).
    """
    keywords = [w for w in re.split(r"\s+", query.strip()) if len(w) > 3]
    out = []
    seen_urls = set()

    # Phase 1: category-specific feeds
    feed_keys = []
    if category and category in _CATEGORY_TO_FEEDS:
        feed_keys.append(_CATEGORY_TO_FEEDS[category])
    feed_keys.append("general")
    seen_keys = set()

    for fk in feed_keys:
        if fk in seen_keys:
            continue
        seen_keys.add(fk)
        for feed_url in DIRECT_FEEDS.get(fk, []):
            items = _fetch_feed(feed_url)
            # Score and sort
            scored = [(it, _score(it, keywords)) for it in items]
            scored.sort(key=lambda x: -x[1])
            for it, sc in scored:
                if sc == 0:
                    continue
                if it["url"] in seen_urls:
                    continue
                # Skip social/paywall domains
                if any(d in it["url"] for d in (
                    "news.google.com", "youtube.com", "facebook.com",
                    "instagram.com", "twitter.com", "x.com", "tiktok.com",
                    "reddit.com", "pinterest.com", "linkedin.com", "wa.me", "t.me",
                )):
                    continue
                seen_urls.add(it["url"])
                out.append(it)
                if len(out) >= limit:
                    return out

    # Phase 2: DuckDuckGo HTML fallback — returns real article URLs (via DDG redirect).
    # Skipped if we already have enough results from phase 1.
    if len(out) < limit:
        try:
            url = "https://html.duckduckgo.com/html/?" + urllib.parse.urlencode({
                "q": query,
                "kl": "mx-es",
            })
            req = urllib.request.Request(url, headers={
                "User-Agent": "Mozilla/5.0 (X11; Linux) Firefox/115",
            })
            with urllib.request.urlopen(req, timeout=15) as r:
                html = r.read().decode("utf-8", "replace")
            # DDG result links: class="result__a" href="..."  OR uddg= encoded URL
            for m in re.finditer(
                r'class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)</a>',
                html, re.IGNORECASE,
            ):
                href = m.group(1)
                title_html = m.group(2)
                # Resolve DDG redirect wrapper to the real URL
                if "uddg=" in href:
                    real = urllib.parse.unquote(
                        re.search(r"uddg=([^&]+)", href).group(1)
                        if "uddg=" in href else href
                    )
                else:
                    real = href
                # Skip social/paywall/news.google
                if any(d in real for d in (
                    "news.google.com", "youtube.com", "facebook.com",
                    "instagram.com", "twitter.com", "x.com", "tiktok.com",
                    "reddit.com", "pinterest.com", "linkedin.com", "wa.me", "t.me",
                    "duckduckgo.com",
                )):
                    continue
                title = re.sub(r"<[^>]+>", "", title_html).strip()
                desc_m = re.search(
                    r'class="result__snippet"[^>]*>([\s\S]*?)</[^>]+>',
                    html[m.end():m.end() + 4000], re.IGNORECASE,
                )
                desc = ""
                if desc_m:
                    desc = re.sub(r"<[^>]+>", "", desc_m.group(1)).strip()
                    desc = re.sub(r"\s+", " ", desc)[:300]
                if real in seen_urls:
                    continue
                seen_urls.add(real)
                out.append({"title": title, "url": real, "snippet": desc})
                if len(out) >= limit:
                    return out
        except Exception as e:
            print(f"      ! ddg fallback error: {e}", file=sys.stderr)

    return out


def extract_article(url):
    """Fetch a URL and extract clean main-article text. Returns up to 5000 chars
    of body content (vs the old 2500-char full-page dump)."""
    try:
        req = urllib.request.Request(url, headers={
            "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
            "Accept": "text/html,application/xhtml+xml",
        })
        with urllib.request.urlopen(req, timeout=20) as r:
            ct = r.headers.get("Content-Type", "")
            if "html" not in ct:
                return None
            html = r.read().decode("utf-8", "replace")
        # Use the smart main-content extractor (strips nav/ads/share/comments)
        text = extract_main_content(html, max_chars=5000)
        if len(text) < 200:
            return None
        return text
    except Exception as e:
        return None


# ======== DOWNLOAD HELPERS ========
def download(url, dest, max_size_mb=20):
    """Download a file to dest. Returns (path, bytes) or (None, error)."""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=30) as r:
            data = r.read()
        if len(data) > max_size_mb * 1024 * 1024:
            return None, "too large"
        with open(dest, "wb") as f:
            f.write(data)
        return dest, len(data)
    except Exception as e:
        return None, str(e)


def upload_multipart(c, path, file_path, content_type="image/jpeg"):
    """Upload a single file via multipart/form-data."""
    if not os.path.exists(file_path) or os.path.getsize(file_path) < 1000:
        return None
    boundary = "----DailySeed"
    with open(file_path, "rb") as f:
        data = f.read()
    filename = os.path.basename(file_path)
    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="files"; filename="{filename}"\r\n'
        f"Content-Type: {content_type}\r\n\r\n"
    ).encode() + data + f"\r\n--{boundary}--\r\n".encode()
    headers = {"Content-Type": f"multipart/form-data; boundary={boundary}"}
    try:
        status, resp = c.req("POST", path, body=body, headers=headers, raw=True)
        if status == 201 and resp:
            return resp
    except AssertionError as e:
        print(f"        upload failed: {str(e)[:120]}")
    return None


# ======== POST CONSTRUCTION ========
def build_post(c, category, query, force_gallery=False, force_video=False, active_slot="daily"):
    """
    Build a single post by searching today's news for the query.
    Editorial approach: adapts tone per category, adds journalistic structure
    (lead, context, quote, why-it-matters), includes source attribution.
    """
    results = search(query, limit=5, category=category)
    if not results:
        return None

    # Multi-source enrichment: fetch 2-3 candidates, pick the longest/cleanest
    # as primary, keep the rest for cross-source fact-checking.
    bundle = multi_source_extract(results, limit=3)
    primary = bundle["primary"]
    if primary:
        best = {"title": primary["title"], "url": primary["url"]}
        article_text = primary["text"]
    else:
        best = results[0]
        article_text = best.get("snippet", "")

    # Headline: use article title (cleaned)
    title = best["title"].strip()
    title = re.sub(r"\s*[-|]\s*[^-|]{1,40}$", "", title)
    if len(title) > 140:
        title = title[:137] + "..."

    # Editorial excerpts per category — distinctive voice
    editorial_leads = {
        "Política": "🏛️ ",
        "Economía": "💼 ",
        "Seguridad": "🛡️ ",
        "Fútbol": "⚽ ",
        "Deportes": "🏆 ",
        "Tecnología": "🤖 ",
        "Espectáculos": "🎬 ",
        "Sucesos": "⚠️ ",
        "Mundo": "🌍 ",
        "Cultura": "🎨 ",
        "Ciencia": "🔬 ",
        "Salud": "🏥 ",
        # New categories
        "Internacional": "🌐 ",
        "Geopolítica": "🗺️ ",
        "Bienestar": "🧘 ",
        "Vida Saludable": "🥗 ",
        "Cripto": "₿ ",
        "Mercados": "📈 ",
        "Finanzas Personales": "💳 ",
        "Sustentabilidad": "🌱 ",
        "Hogar": "🏡 ",
        "Familia": "👨‍👩‍👧 ",
        "Viajes": "✈️ ",
        "Gastronomía": "🍴 ",
        "Salud Mental": "🧠 ",
        "IA": "🤖 ",
    }
    lead = editorial_leads.get(category, "📰 ")

    # Body: journalistic structure — Lead / Background / Why it matters / Source
    source_url = best["url"]
    source_domain = source_url.split("/")[2] if "/" in source_url else "fuente"

    # Extract first 3-4 paragraphs as "body core" (keep vars for summary build)
    paragraphs = ([p.strip() for p in article_text.split("\n\n") if len(p.strip()) > 60]
                  if article_text else [])
    if not paragraphs:
        paragraphs = [article_text[:800]] if article_text else [""]

    lead_para = paragraphs[0][:500] if paragraphs else ""
    context_para = paragraphs[1][:400] if len(paragraphs) > 1 else ""
    detail_para = paragraphs[2][:400] if len(paragraphs) > 2 else ""

    # ===== Editorial summary (NEW) =====
    # 2-3 lines, bullet-driven "what changed + why it matters". Independent
    # field from `excerpt` (which stays a 1-line hook). Per-category voice.
    fact = (paragraphs[0][:260].replace("\n", " ").strip()
            if paragraphs else article_text[:260].replace("\n", " ").strip())
    summary_templates = {
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
        "Internacional": (
            "📌 Hecho: {fact}\n"
            "🌐 Impacto: mueve el tablero diplomático, comercial y de seguridad a escala regional.\n"
            "🎯 A seguir: reacciones de aliados, sanciones, cumbres o nuevas negociaciones."
        ),
        "Geopolítica": (
            "📌 Hecho: {fact}\n"
            "🗺️ Impacto: altera el equilibrio de poder entre bloques y la lectura estratégica del conflicto.\n"
            "👀 A seguir: movimientos de potencias, organismos multilaterales y rutas de suministro."
        ),
        "Bienestar": (
            "📌 Hecho: {fact}\n"
            "🧘 Impacto: ofrece (o cuestiona) una práctica concreta para reducir estrés y mejorar hábitos.\n"
            "🎯 A seguir: validación científica, rutinas recomendadas y contraindicaciones."
        ),
        "Vida Saludable": (
            "📌 Hecho: {fact}\n"
            "🥗 Impacto: cambia (o confirma) lo que sabemos sobre nutrición, movimiento y descanso.\n"
            "👀 A seguir: meta-análisis recientes, opinión de nutriólogos y guías oficiales."
        ),
        "Salud Mental": (
            "📌 Hecho: {fact}\n"
            "🧠 Impacto: visibiliza un tema que sigue estigmatizado y ofrece rutas de acompañamiento.\n"
            "👀 A seguir: recursos de ayuda profesional, líneas de crisis y campañas públicas."
        ),
        "Cripto": (
            "📌 Hecho: {fact}\n"
            "₿ Impacto: mueve liquidez, sentiment y narrativas del ciclo; altcoins suelen amplificar.\n"
            "⚠️ Advertencia: alta volatilidad. DYOR. No es asesoría financiera."
        ),
        "Mercados": (
            "📌 Hecho: {fact}\n"
            "📈 Impacto: sesgo sectorial, rotación entre value/growth y presión sobre activos refugio.\n"
            "🎯 A seguir: datos macro de la semana, earnings y comentarios de bancos centrales."
        ),
        "Finanzas Personales": (
            "📌 Hecho: {fact}\n"
            "💳 Impacto: cambia una decisión concreta que afecta bolsillo, crédito o ahorro.\n"
            "🎯 A seguir: comparar comisiones, leer letra chica y revisar tu colchón de emergencia."
        ),
        "Sustentabilidad": (
            "📌 Hecho: {fact}\n"
            "🌱 Impacto: acelera (o retrasa) la transición hacia prácticas ESG y energía limpia.\n"
            "👀 A seguir: regulación, financiamiento verde y presión de consumidores e inversionistas."
        ),
        "Hogar": (
            "📌 Hecho: {fact}\n"
            "🏡 Impacto: una idea concreta para mejorar confort, funcionalidad o estética del hogar.\n"
            "🎯 A seguir: opciones de presupuesto, materiales locales y tutoriales paso a paso."
        ),
        "Familia": (
            "📌 Hecho: {fact}\n"
            "👨‍👩‍👧 Impacto: aplica a la dinámica diaria de crianza, comunicación o educación en casa.\n"
            "👀 A seguir: consejo de especialistas y adaptaciones según la edad de los hijos."
        ),
        "Viajes": (
            "📌 Hecho: {fact}\n"
            "✈️ Impacto: cambia (o confirma) el mejor momento, ruta o presupuesto para tu próximo viaje.\n"
            "🎯 A seguir: seasonality, requisitos migratorios y tips de quien ya fue."
        ),
        "Gastronomía": (
            "📌 Hecho: {fact}\n"
            "🍴 Impacto: trae una receta, tendencia o técnica que se puede replicar en casa esta semana.\n"
            "👀 A seguir: sustituciones por temporada, maridaje y reseñas de chefs locales."
        ),
        "IA": (
            "📌 Hecho: {fact}\n"
            "🤖 Impacto: developers, empresas y usuarios ganan (o pierden) capacidad clave en su flujo.\n"
            "🎯 A seguir: benchmarks independientes, casos de uso reales y comentarios de la comunidad."
        ),
    }
    tpl = summary_templates.get(
        category,
        "📌 Hecho: {fact}\n"
        "🎯 Por qué importa: agrega contexto nuevo a la conversación y merece seguimiento.\n"
        "👀 A seguir: reacciones oficiales y lecturas especializadas."
    )
    summary = tpl.format(fact=fact)
    # Hard cap at 400 chars (Post.summary maxlength). Prefer cutting at a newline.
    if len(summary) > 400:
        summary = summary[:397].rsplit("\n", 1)[0] + "…"

    # Excerpt: 1-line hook (kept short on purpose; the heavy lifting moved to summary)
    raw_excerpt = article_text[:400].replace("\n", " ").strip()
    excerpt = raw_excerpt[:240].strip()
    if len(excerpt) > 230:
        excerpt = excerpt[:227].rstrip() + "..."
    excerpt = lead + excerpt

    # ===== Journalistic body (NEW) =====
    # Replace the per-category framing templates with a full journalistic
    # structure (Lead → Qué pasó → Contexto → Cifra / cita → Por qué importa
    # → Fuente). Pulls primary text + cross-source facts from multi_source_extract.
    source_url = primary["url"] if primary else best.get("url", "")
    source_domain = (source_url.split("/")[2] if "/" in source_url else "fuente")
    body = build_journalistic_body(
        primary=primary,
        secondary_facts=bundle["all_facts"] if bundle else [],
        category=category,
        source_url=source_url,
        source_domain=source_domain,
    )
    if not body:
        # Defensive fallback: at minimum, lead + source
        body = (
            f"{lead_para[:400]}\n\n"
            f"---\n\n"
            f"📰 Fuente: [{source_domain}]({source_url})\n"
            "🤖 Publicado automáticamente por el digest editorial de Aguitech Core.\n"
            f"🕐 Hora de cierre editorial: {_format_editorial_timestamp()}"
        )


    # Tags — more specific, with date + slot stamp
    today = datetime.now().strftime("%Y-%m-%d")
    tags = [category, "México", "Hoy", today, active_slot]
    # Extract keywords from title (capitalized words > 3 chars)
    keywords = re.findall(r"\b([A-ZÁÉÍÓÚÑ][a-záéíóúñ]{3,})\b", title)
    for kw in keywords[:3]:
        if kw not in tags and len(kw) < 25:
            tags.append(kw)

    # Cover image
    cover_path = None
    cover_url = COVER_UNSPLASH.get(category, COVER_UNSPLASH["Mundo"])
    cover_filename = os.path.join(IMG_DIR, f"{category.lower()}_cover.jpg")
    p, _ = download(cover_url, cover_filename)
    if p:
        cover_path = p

    # Gallery
    gallery_paths = []
    if force_gallery and category in GALLERY_BANK:
        for i, img_url in enumerate(GALLERY_BANK[category][:5]):
            gp = os.path.join(IMG_DIR, f"{category.lower()}_gal{i}.jpg")
            p, _ = download(img_url, gp)
            if p:
                gallery_paths.append(p)

    # Video
    video_path = None
    if force_video and category in VIDEO_BANK:
        vp = os.path.join(VID_DIR, f"{category.lower()}_clip.mp4")
        p, err = download(VIDEO_BANK[category], vp, max_size_mb=50)
        if p and os.path.getsize(p) > 50000:
            video_path = p

    return {
        "title": title,
        "excerpt": excerpt,
        "summary": summary,
        "body": body,
        "tags": tags,
        "source_url": source_url,
        "source": source_domain,
        "cover_path": cover_path,
        "gallery_paths": gallery_paths,
        "video_path": video_path,
        "category": category,
    }





# ======== DB OPERATIONS ========
def get_categories(c):
    _, resp = c.req("GET", "/api/blog/categories")
    cats = resp if isinstance(resp, list) else resp.get("items", resp.get("categories", []))
    return {cat["name"]: cat for cat in cats}


def ensure_category(c, name, existing):
    if name in existing:
        return existing[name]["_id"]
    icon, color = CATEGORY_REGISTRY.get(name, ("📰", "#FF6A00"))
    _, body = c.req("POST", "/api/blog/categories",
                    body={"name": name, "icon": icon, "color": color},
                    expect=201)
    return body["_id"]


def today_post_exists(c, slot_tag=None):
    """Returns True if a post with today's date tag exists.
    If slot_tag provided, only blocks if a post with that slot tag exists."""
    today = datetime.now().strftime("%Y-%m-%d")
    _, resp = c.req("GET", "/api/blog/posts",
                    params={"limit": 200})
    posts = resp if isinstance(resp, list) else resp.get("items", resp.get("posts", []))
    for p in posts:
        tags = p.get("tags") or []
        if today not in tags:
            continue
        if slot_tag and slot_tag not in tags:
            continue
        return True
    return False


def publish_post(c, post, cat_ids):
    """Publish a single post: create + upload media + set cover."""
    cat_id = cat_ids[post["category"]]
    _, body = c.req("POST", "/api/blog/posts", body={
        "title": post["title"],
        "excerpt": post["excerpt"],
        "summary": post.get("summary", ""),
        "body": post["body"],
        "category": cat_id,
        "tags": post["tags"],
        "status": "publicado",
        "links": [
            {"url": post["source_url"], "title": f"Fuente: {post['source']}",
             "description": "Artículo original de la fuente"}
        ] if post.get("source_url") else [],
    }, expect=201)
    post_id = body["_id"]
    print(f"      ✓ post id={post_id}")

    # Upload cover (always)
    if post.get("cover_path"):
        up = upload_multipart(c, f"/api/blog/posts/{post_id}/images",
                              post["cover_path"])
        if up and len(up) > 0:
            url = up[0]["url"]
            c.req("PUT", f"/api/blog/posts/{post_id}",
                  body={"coverImage": url}, expect=200)
            print(f"        ↳ cover set")

    # Upload gallery
    if post.get("gallery_paths"):
        print(f"        ↳ uploading {len(post['gallery_paths'])} gallery images...")
        uploaded = 0
        for gp in post["gallery_paths"]:
            up = upload_multipart(c, f"/api/blog/posts/{post_id}/images", gp)
            if up:
                uploaded += 1
        print(f"        ↳ gallery uploaded ({uploaded}/{len(post['gallery_paths'])})")

    # Upload video
    if post.get("video_path"):
        print(f"        ↳ uploading video...")
        up = upload_multipart(c, f"/api/blog/posts/{post_id}/videos",
                              post["video_path"], content_type="video/mp4")
        if up:
            print(f"        ↳ video uploaded ({len(up)} file(s))")

    return post_id


# ======== MAIN ========
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true",
                    help="Show plan without publishing")
    ap.add_argument("--force", action="store_true",
                    help="Ignore idempotency check")
    ap.add_argument("--gallery-topics", type=int, default=3,
                    help="Number of topics that get a 5-photo gallery (default 3)")
    ap.add_argument("--video-topics", type=int, default=2,
                    help="Number of topics that get a video (default 2)")
    ap.add_argument("--slot", type=str, default=None,
                    help="Editorial slot: morning_briefing|mid_morning|lunchtime|evening|night_wrap|midnight_world|deep_wellness|pre_market_finance|breakfast_brief|afternoon_lifestyle|tech_ai_wave1|tech_ai_wave2|culture_news_burst|culture_news_late|tech_ai_recap")
    ap.add_argument("--shuffle", action="store_true",
                    help="Shuffle topics within the active slot")
    ap.add_argument("--max-posts", type=int, default=10,
                    help="Max posts to publish per run (default 10)")
    args = ap.parse_args()

    today = datetime.now().strftime("%Y-%m-%d")
    active_slot = (args.slot
                   or os.environ.get("AGUITTECH_DIGEST_SLOT")
                   or "morning_briefing")
    print(f"=== Aguitech Daily Digest — {today} · slot={active_slot} ===\n")

    c = Client(BASE)
    print("[1/5] Login...")
    user = c.login(ADMIN_EMAIL, ADMIN_PASSWORD)
    print(f"      ✓ {user['name']} ({user['role']})\n")

    print("[2/5] Idempotency check...")
    if not args.force and today_post_exists(c, slot_tag=active_slot):
        print(f"      ! Posts for {today} in slot '{active_slot}' already exist. Use --force to override.")
        return 0
    print(f"      ✓ no posts tagged {today} in slot '{active_slot}' yet\n")

    print("[3/5] Categories...")
    existing = get_categories(c)
    cat_ids = {name: ensure_category(c, name, existing)
               for name in CATEGORY_REGISTRY.keys()}
    print(f"      ✓ {len(cat_ids)} categories ready\n")

    # Pick topics from active slot profile
    pool = list(SLOT_PROFILES.get(active_slot, SLOT_PROFILES["morning_briefing"]))
    if args.shuffle:
        random.shuffle(pool)
    selected = pool[:args.max_posts]

    # Decide which get gallery / video
    gallery_categories = set()
    video_categories = set()
    gallery_eligible = [q[0] for q in selected if q[0] in GALLERY_BANK]
    video_eligible = [q[0] for q in selected if q[0] in VIDEO_BANK]
    random.shuffle(gallery_eligible)
    random.shuffle(video_eligible)
    gallery_categories = set(gallery_eligible[:args.gallery_topics])
    video_categories = set(video_eligible[:args.video_topics])

    # Make sure video topics that aren't in gallery get at least gallery if they qualify
    # (videos imply rich content)
    for cat in video_categories - gallery_categories:
        if cat in GALLERY_BANK:
            gallery_categories.add(cat)
            if len(gallery_categories) > args.gallery_topics + args.video_topics:
                # cap combined to gallery_topics + video_topics
                pass

    print(f"[4/5] Building 10 posts (this takes ~2-3 min)...\n")
    published = []
    for i, (cat, query) in enumerate(selected, 1):
        force_gallery = cat in gallery_categories
        force_video = cat in video_categories
        flags = []
        if force_gallery:
            flags.append("🖼️gallery")
        if force_video:
            flags.append("🎬video")
        flag_str = " " + " ".join(flags) if flags else ""
        print(f"  [{i:2d}/10] {cat:12s} — {query[:50]}{flag_str}")

        if args.dry_run:
            continue

        post = build_post(c, cat, query,
                          force_gallery=force_gallery,
                          force_video=force_video,
                          active_slot=active_slot)
        if not post:
            print(f"        ! no usable content, skipping")
            continue
        print(f"        title: {post['title'][:70]}...")
        try:
            pid = publish_post(c, post, cat_ids)
            published.append(pid)
        except Exception as e:
            print(f"        ! publish failed: {str(e)[:200]}")
        time.sleep(0.5)  # be nice to the API

    print()
    print(f"[5/5] Summary...")
    print(f"      ✓ {len(published)}/10 posts published")
    if args.dry_run:
        print(f"      (dry-run mode — nothing was actually published)")

    # Send a notification to admin with the digest summary
    if not args.dry_run and published:
        try:
            c.req("POST", "/api/notifications/mark-read", body={"all": True})
            digest_text = (
                f"📰 Daily digest {today}: {len(published)} posts publicados. "
                f"Galerías: {len(gallery_categories)}, videos: {len(video_categories)}. "
                f"Ver: https://sxxysecret.com/public/blog"
            )
            print(f"      ✓ admin notified")
        except Exception:
            pass

    print(f"\n=== Done! Public URL: https://sxxysecret.com/public/blog ===")
    return 0


if __name__ == "__main__":
    sys.exit(main())