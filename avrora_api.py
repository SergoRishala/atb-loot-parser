"""
Модуль парсингу інтернет-магазину мережі мультимаркетів «Аврора» (avrora.ua).
Підтримує завантаження акційних товарів (сторінки ?page=N) та пошук.

ВАЖЛИВО: Сайт захищений Cloudflare. Для обходу використовується curl-cffi,
яка імітує TLS-відбиток справжнього браузера Chrome.
"""

import re
import time
import logging
from typing import Optional, Dict, List, Any

try:
    from curl_cffi import requests as cffi_requests
    _USE_CFFI = True
except ImportError:
    import requests as _requests
    _USE_CFFI = False
    logging.warning("curl-cffi не встановлено; Avrora може не завантажуватись через Cloudflare.")

from bs4 import BeautifulSoup

BASE_URL = "https://avrora.ua"
SALE_PAGES = 21          # скільки сторінок акцій є на сайті
REQUEST_TIMEOUT = 20
HEADERS = {
    "Accept-Language": "uk-UA,uk;q=0.9,en-US;q=0.8,en;q=0.7",
    "Referer": "https://avrora.ua/",
}

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────
#   ДОПОМІЖНІ ФУНКЦІЇ
# ─────────────────────────────────────────────

def _get(url: str, params: Optional[Dict] = None, timeout: int = REQUEST_TIMEOUT) -> Optional[str]:
    """HTTP GET з curl-cffi (обхід Cloudflare) або fallback на requests."""
    try:
        if _USE_CFFI:
            r = cffi_requests.get(
                url,
                params=params,
                headers=HEADERS,
                impersonate="chrome120",
                timeout=timeout,
                allow_redirects=True,
            )
        else:
            import requests
            r = requests.get(url, params=params, headers=HEADERS, timeout=timeout)
        if r.status_code == 200:
            return r.text
        logger.warning("Avrora GET %s → HTTP %s", url, r.status_code)
    except Exception as exc:
        logger.error("Avrora GET %s → %s", url, exc)
    return None


def _clean(text: Optional[str]) -> str:
    return " ".join(str(text or "").split())


def _to_float(val: Any) -> Optional[float]:
    try:
        s = re.sub(r"[^\d.,]", "", str(val or "")).replace(",", ".")
        f = float(s)
        return f if f > 0 else None
    except Exception:
        return None


WEIGHT_UNITS = ["мл", "л", "г", "кг", "шт", "уп", "мг", "см", "пар", "шт/уп"]

def extract_weight(title: str) -> str:
    """
    Витягує об'єм/вагу з назви товару (останні 2 слова, якщо останнє — одиниця виміру).
    Приклад: «Шампунь OLD SPICE 400 мл» → «400 мл»
    """
    words = _clean(title).split()
    if len(words) >= 2:
        last = words[-1].lower().rstrip(".")
        second = words[-2]
        # Перевіряємо: останнє слово — одиниця, передостаннє — число
        if any(last.startswith(u) for u in WEIGHT_UNITS) and re.match(r"^\d", second):
            return f"{second} {words[-1]}"
        # Або все разом: «100шт»
        m = re.match(r"(\d+)\s*(" + "|".join(WEIGHT_UNITS) + r")", last, re.IGNORECASE)
        if m:
            return last
    return ""


def _parse_card(card) -> Optional[Dict[str, Any]]:
    """Парсить одну .ty-grid-list__item картку Аврори."""
    try:
        # Заголовок
        img_el = card.select_one("img.ty-pict")
        title = _clean(img_el.get("alt", "") if img_el else "")
        if not title:
            return None

        # Посилання
        link_el = card.select_one("a[href]")
        link = link_el["href"] if link_el else ""
        if link and not link.startswith("http"):
            link = BASE_URL + link

        # Зображення
        image = img_el.get("src", "") if img_el else ""

        # Стара ціна: .ty-list-price → перший .ty-price-num з числом
        old_price_nums = card.select(".ty-list-price .ty-price-num")
        old_price = None
        for el in old_price_nums:
            v = _to_float(el.get_text(strip=True))
            if v:
                old_price = v
                break

        # Нова ціна: .ty-price-update .ty-price-num або перший .ty-price .ty-price-num
        new_price_el = card.select_one(".ty-price-update .ty-price-num, .ty-price-num")
        new_price = _to_float(new_price_el.get_text(strip=True)) if new_price_el else None

        # Якщо тільки одна ціна в картці — то це і є поточна ціна (без знижки)
        if old_price and new_price and old_price == new_price:
            old_price = None

        # Знижка
        disc_el = card.select_one(".ty-product-labels__item--discount .ty-product-labels__content")
        discount_text = _clean(disc_el.get_text() if disc_el else "")
        discount_pct = None
        if discount_text:
            m = re.search(r"-?(\d+)%", discount_text)
            if m:
                discount_pct = int(m.group(1))
        if discount_pct is None and old_price and new_price and old_price > new_price:
            discount_pct = round((1 - new_price / old_price) * 100)

        # Вага/об'єм
        weight = extract_weight(title)

        # Якщо немає знижки й немає old_price — все одно показуємо товар
        has_discount = bool(discount_pct and discount_pct > 0)
        saving = round(old_price - new_price, 2) if (old_price and new_price and old_price > new_price) else None

        return {
            "title": title,
            "price": new_price,
            "old_price": old_price,
            "discount_percent": discount_pct,
            "has_discount": has_discount,
            "saving": saving,
            "image": image,
            "image_url": image,
            "image_large_url": image,
            "product_url": link,
            "weight": weight,
            "store": "avrora",
        }
    except Exception as exc:
        logger.debug("Помилка парсингу картки Аврори: %s", exc)
        return None


def _parse_page(html: str) -> List[Dict[str, Any]]:
    """Парсить усі картки на сторінці Аврори."""
    soup = BeautifulSoup(html, "html.parser")
    cards = soup.select(".ty-grid-list__item")
    result = []
    for card in cards:
        item = _parse_card(card)
        if item:
            result.append(item)
    return result


# ─────────────────────────────────────────────
#   ПУБЛІЧНЕ API
# ─────────────────────────────────────────────

def get_avrora_promos(pages: tuple = (1,), timeout: int = REQUEST_TIMEOUT) -> List[Dict[str, Any]]:
    """
    Завантажує акційні товари з Аврори (сторінки ?page=N).
    pages — кортеж номерів сторінок, наприклад (1, 2).
    """
    results = []
    for pg in pages:
        url = f"{BASE_URL}/"
        html = _get(url, params={"page": pg}, timeout=timeout)
        if html:
            items = _parse_page(html)
            logger.info("Аврора стор. %d: %d товарів", pg, len(items))
            results.extend(items)
    return results


def get_avrora_promos_page(page: int = 1, timeout: int = REQUEST_TIMEOUT) -> List[Dict[str, Any]]:
    """Зручна обгортка: повертає товари однієї сторінки акцій."""
    return get_avrora_promos(pages=(page,), timeout=timeout)


def search_avrora(query: str, timeout: int = REQUEST_TIMEOUT) -> List[Dict[str, Any]]:
    """
    Пошук товарів на Авроровому сайті.
    Повертає список уніфікованих словників.
    """
    if not query:
        return []
    params = {
        "subcats": "Y", "status": "A",
        "pshort": "Y", "pfull": "Y", "pname": "Y",
        "pkeywords": "Y", "pcode_from_q": "Y",
        "search_performed": "Y",
        "q": query,
        "dispatch": "products.search",
    }
    html = _get(BASE_URL + "/", params=params, timeout=timeout)
    if not html:
        return []
    items = _parse_page(html)
    logger.info("Аврора пошук '%s': %d товарів", query, len(items))
    return items
