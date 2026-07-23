"""
scraper.py — Keeler USA / Accutome product catalog scraper.
Attempts live scrape of keelerusa.com and accutome.com with a 30-minute
in-memory cache. Falls back to a hardcoded catalog if scraping fails.
"""

import time
import requests
from bs4 import BeautifulSoup
from typing import List, Dict

# ── Cache ─────────────────────────────────────────────────────────────────────
_CACHE: Dict = {"products": None, "ts": 0}
CACHE_TTL = 1800  # 30 minutes

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml",
}
TIMEOUT = 8


# ── Fallback catalog (always available) ───────────────────────────────────────
FALLBACK_CATALOG: List[Dict] = [
    # ── Tonometry ──────────────────────────────────────────────────────────
    {"name": "Pulsair IntelliPuff", "category": "Tonometry",
     "description": "Handheld non-contact tonometer; no drops needed. Ideal for screening and mobile use.",
     "type": "Equipment", "source": "Keeler USA"},
    {"name": "Pulsair Desktop", "category": "Tonometry",
     "description": "Desktop non-contact tonometer with automated measurement and data output.",
     "type": "Equipment", "source": "Keeler USA"},
    {"name": "Keeler Applanation Tonometer", "category": "Tonometry",
     "description": "Goldmann-style applanation tonometer; slit-lamp mounted for precise IOP measurement.",
     "type": "Equipment", "source": "Keeler USA"},

    # ── Ophthalmoscopy ─────────────────────────────────────────────────────
    {"name": "Vantage Plus", "category": "Indirect Ophthalmoscopy",
     "description": "Premium binocular indirect ophthalmoscope (BIO); LED illumination; used for retinal exams.",
     "type": "Capital Equipment", "source": "Keeler USA"},
    {"name": "All Pupil II", "category": "Indirect Ophthalmoscopy",
     "description": "Lightweight BIO with adjustable pupil distance; popular for retina and pediatric practices.",
     "type": "Capital Equipment", "source": "Keeler USA"},
    {"name": "Keeler Standard Ophthalmoscope", "category": "Direct Ophthalmoscopy",
     "description": "Direct ophthalmoscope for anterior and posterior segment examination.",
     "type": "Equipment", "source": "Keeler USA"},
    {"name": "Practitioner Ophthalmoscope", "category": "Direct Ophthalmoscopy",
     "description": "High-quality direct ophthalmoscope; rechargeable handle system.",
     "type": "Equipment", "source": "Keeler USA"},

    # ── Retinoscopy / Refraction ───────────────────────────────────────────
    {"name": "Keeler Streak Retinoscope", "category": "Retinoscopy",
     "description": "Professional streak retinoscope for objective refraction.",
     "type": "Equipment", "source": "Keeler USA"},

    # ── Slit Lamps ─────────────────────────────────────────────────────────
    {"name": "Keeler K Series Slit Lamp", "category": "Slit Lamp",
     "description": "Table-mounted slit lamp biomicroscope with variable illumination and magnification.",
     "type": "Capital Equipment", "source": "Keeler USA"},
    {"name": "Keeler PSL Classic Portable Slit Lamp", "category": "Slit Lamp",
     "description": "Portable hand-held slit lamp for mobile, emergency, and pediatric use.",
     "type": "Equipment", "source": "Keeler USA"},

    # ── Surgical Loupes ────────────────────────────────────────────────────
    {"name": "Keeler Surgical Loupes — Flip-Up", "category": "Surgical Loupes",
     "description": "Flip-up style surgical loupes; custom magnification (2.5x–6.0x); used in surgery and clinic.",
     "type": "Equipment", "source": "Keeler USA"},
    {"name": "Keeler Surgical Loupes — Through-The-Lens (TTL)", "category": "Surgical Loupes",
     "description": "TTL loupes; lighter weight; custom-fitted to individual clinician.",
     "type": "Equipment", "source": "Keeler USA"},
    {"name": "Keeler LED Headlight", "category": "Surgical Loupes",
     "description": "Lightweight LED headlight; pairs with loupes for enhanced illumination.",
     "type": "Accessory", "source": "Keeler USA"},

    # ── Accutome — Ultrasound / Biometry ──────────────────────────────────
    {"name": "B-Scan Pro", "category": "Diagnostic Ultrasound",
     "description": "Contact B-scan ophthalmic ultrasound system; used for posterior segment imaging when media is opaque.",
     "type": "Capital Equipment", "source": "Accutome"},
    {"name": "Accutome UBM Plus", "category": "Diagnostic Ultrasound",
     "description": "Ultrasound biomicroscopy (UBM) for anterior segment imaging; ideal for glaucoma and angle assessment.",
     "type": "Capital Equipment", "source": "Accutome"},
    {"name": "PacScan 300AP+", "category": "Pachymetry",
     "description": "Ultrasound pachymeter for corneal thickness measurement; essential for glaucoma management and refractive surgery screening.",
     "type": "Equipment", "source": "Accutome"},
    {"name": "AccuPac", "category": "Pachymetry",
     "description": "Compact ultrasound pachymeter; handheld design for chair-side use.",
     "type": "Equipment", "source": "Accutome"},
    {"name": "A-Scan / Biometry System", "category": "Biometry",
     "description": "Ultrasound A-scan for IOL power calculation; used pre-cataract surgery.",
     "type": "Capital Equipment", "source": "Accutome"},
    {"name": "Accutome 4Sight", "category": "Biometry",
     "description": "Combined A-scan / pachymeter system; streamlines pre-surgical biometry workflow.",
     "type": "Capital Equipment", "source": "Accutome"},

    # ── Probes / Consumables ───────────────────────────────────────────────
    {"name": "B-Scan Probe Covers / Sheaths", "category": "Consumables",
     "description": "Single-use sterile probe covers for B-scan ultrasound; reorder item.",
     "type": "Daily-Use Consumable", "source": "Accutome"},
    {"name": "Ultrasound Coupling Gel", "category": "Consumables",
     "description": "Methylcellulose gel for ultrasound contact scanning; reorder consumable.",
     "type": "Daily-Use Consumable", "source": "Accutome"},
    {"name": "Pachymeter Probe Tips", "category": "Consumables",
     "description": "Replacement probe tips for pachymeter systems; periodic reorder.",
     "type": "Procedure-Driven Consumable", "source": "Accutome"},

    # ── Accessories ────────────────────────────────────────────────────────
    {"name": "Keeler Rechargeable Handle System", "category": "Accessories",
     "description": "Universal rechargeable handle compatible with Keeler ophthalmoscopes and retinoscopes.",
     "type": "Accessory", "source": "Keeler USA"},
    {"name": "Slit Lamp Accessories (Lenses, Filters)", "category": "Accessories",
     "description": "Supplemental lenses and filters for slit lamp biomicroscopy.",
     "type": "Accessory", "source": "Keeler USA"},
]


# ── Scraper ────────────────────────────────────────────────────────────────────
def _scrape_keelerusa() -> List[Dict]:
    """Attempt to scrape keelerusa.com product listings."""
    products = []
    try:
        # Products page
        r = requests.get("https://www.keelerusa.com/products/", headers=HEADERS, timeout=TIMEOUT)
        if r.status_code != 200:
            return []
        soup = BeautifulSoup(r.text, "html.parser")

        # Try common product card patterns
        cards = soup.select(".product-item, .product-card, article.product, .woocommerce-product, li.product")
        for card in cards[:30]:
            name_el = card.select_one("h2, h3, .product-title, .woocommerce-loop-product__title")
            desc_el = card.select_one("p, .product-description, .short-description")
            link_el = card.select_one("a[href]")
            if name_el:
                products.append({
                    "name": name_el.get_text(strip=True),
                    "category": "Keeler Product",
                    "description": desc_el.get_text(strip=True)[:200] if desc_el else "",
                    "type": "Equipment",
                    "source": "Keeler USA (scraped)",
                    "url": link_el["href"] if link_el else "https://www.keelerusa.com",
                })
    except Exception as e:
        print(f"[scraper] keelerusa.com scrape failed: {e}")
    return products


def _scrape_accutome() -> List[Dict]:
    """Attempt to scrape accutome.com product listings."""
    products = []
    try:
        r = requests.get("https://www.accutome.com/products", headers=HEADERS, timeout=TIMEOUT)
        if r.status_code != 200:
            return []
        soup = BeautifulSoup(r.text, "html.parser")

        cards = soup.select(".product-item, .product-card, article.product, .product-wrapper")
        for card in cards[:30]:
            name_el = card.select_one("h2, h3, .product-title, .product-name")
            desc_el = card.select_one("p, .product-description")
            link_el = card.select_one("a[href]")
            if name_el:
                products.append({
                    "name": name_el.get_text(strip=True),
                    "category": "Accutome Product",
                    "description": desc_el.get_text(strip=True)[:200] if desc_el else "",
                    "type": "Equipment",
                    "source": "Accutome (scraped)",
                    "url": link_el["href"] if link_el else "https://www.accutome.com",
                })
    except Exception as e:
        print(f"[scraper] accutome.com scrape failed: {e}")
    return products


def get_products() -> List[Dict]:
    """
    Return the Keeler/Accutome product catalog.
    Scrapes live if cache is stale; falls back to hardcoded catalog if scraping
    yields fewer than 5 products.
    """
    global _CACHE
    now = time.time()

    if _CACHE["products"] and (now - _CACHE["ts"]) < CACHE_TTL:
        return _CACHE["products"]

    scraped = _scrape_keelerusa() + _scrape_accutome()
    if len(scraped) >= 5:
        products = scraped + FALLBACK_CATALOG  # Merge scraped + hardcoded
    else:
        products = FALLBACK_CATALOG

    _CACHE["products"] = products
    _CACHE["ts"] = now
    return products


def format_for_prompt(products: List[Dict]) -> str:
    """Format product catalog as a compact string for Claude's context."""
    lines = []
    by_category: Dict[str, List] = {}
    for p in products:
        cat = p.get("category", "General")
        by_category.setdefault(cat, []).append(p)

    for cat, items in by_category.items():
        lines.append(f"\n[{cat}]")
        for p in items:
            lines.append(f"  • {p['name']} ({p['source']}): {p['description'][:120]}")
    return "\n".join(lines)
