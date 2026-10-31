"""
Модуль парсингу інтернет-магазину мережі «EVA» (eva.ua).
Підтримує пошук товарів та завантаження акційних товарів з каталогу.

ВАЖЛИВО: Сайт захищений Cloudflare. Для обходу використовується curl-cffi,
яка імітує TLS-відбиток справжнього браузера Chrome через постійну сесію.
"""

import re
import time
import logging
import threading
from typing import Optional, Dict, List, Any

try:
    from curl_cffi import requests as cffi_requests
    _USE_CFFI = True
except ImportError:
    import requests as _requests
    _USE_CFFI = False
    logging.warning("curl-cffi не встановлено; EVA може не завантажуватись через Cloudflare.")

from bs4 import BeautifulSoup

BASE_URL = "https://eva.ua"
REQUEST_TIMEOUT = 20

# Категорії EVA з фільтром «акційні товари»
PROMO_CATEGORIES = [
    "/ua/024/uhod-soboj/filter/is_used_in_promotions-1/",
    "/ua/217/parfjumerija/filter/is_used_in_promotions-1/",
    "/ua/220/bytovaja-himija/filter/is_used_in_promotions-1/",
    "/ua/299/kosmetika-dekorativnaja/filter/is_used_in_promotions-1/",
    "/ua/12701/lico/filter/is_used_in_promotions-1/",
    "/ua/12698/volosy/filter/is_used_in_promotions-1/",
]

HEADERS = {
    "Accept-Language": "uk-UA,uk;q=0.9,en-US;q=0.8,en;q=0.7",
    "Referer": "https://eva.ua/",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
}

logger = logging.getLogger(__name__)

_session_lock = threading.Lock()
_eva_session = None


def _get_session():
    """Створює або повертає активну сесію curl-cffi з прогрітими куками."""
    global _eva_session
    with _session_lock:
        if _eva_session is None:
            if _USE_CFFI:
                s = cffi_requests.Session(impersonate="chrome120")
                s.headers.update(HEADERS)
                try:
                    s.get(f"{BASE_URL}/ua/", timeout=10)
                except Exception:
                    pass
                _eva_session = s
            else:
                import requests
                s = requests.Session()
                s.headers.update(HEADERS)
                _eva_session = s
        return _eva_session


def _reset_session():
    """Скидає сесію у випадку помилки/403."""
    global _eva_session
    with _session_lock:
        _eva_session = None


def _get(url: str, params: Optional[Dict] = None, timeout: int = REQUEST_TIMEOUT, retries: int = 2) -> Optional[str]:
    """HTTP GET з curl-cffi (обхід Cloudflare) та автоматичним повтором при 403."""
    for attempt in range(retries):
        try:
            s = _get_session()
            r = s.get(url, params=params, timeout=timeout, allow_redirects=True)
            if r.status_code == 200:
                return r.text
            elif r.status_code == 403:
                logger.warning("EVA GET %s → 403 (спроба %d/%d), перезапуск сесії...", url, attempt + 1, retries)
                _reset_session()
                time.sleep(0.8)
            else:
                logger.warning("EVA GET %s → HTTP %s", url, r.status_code)
                break
        except Exception as exc:
            logger.error("EVA GET %s → %s", url, exc)
            _reset_session()
            time.sleep(0.5)
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


WEIGHT_UNITS = ["мл", "л", "г", "кг", "шт", "уп", "мг", "см", "пар"]

def _extract_weight(title: str) -> str:
    """Витягує вагу/об'єм з назви товару EVA."""
    words = _clean(title).split()
    if len(words) >= 2:
        last = words[-1].rstrip(".").lower()
        second = words[-2].rstrip(",")
        if any(last.startswith(u) for u in WEIGHT_UNITS) and re.match(r"^\d", second):
            return f"{second} {words[-1]}"
        m = re.match(r"^(\d+(?:[.,]\d+)?)\s*(" + "|".join(WEIGHT_UNITS) + r")$", last, re.I)
        if m:
            return last
    return ""


def _parse_card(card) -> Optional[Dict[str, Any]]:
    """Парсить одну .o-listing-product картку EVA."""
    try:
        # Заголовок
        link_el = card.select_one("a[aria-label]")
        raw_title = link_el.get("aria-label", "") if link_el else ""
        title = _clean(raw_title.replace("Відкрити сторінку товару: ", ""))
        if not title:
            t_el = card.select_one(".product__title, [data-testid='product-title'], a[href] span")
            title = _clean(t_el.get_text() if t_el else "")
        if not title:
            link_fallback = card.select_one("a[href]")
            title = _clean(link_fallback.get_text() if link_fallback else "")

        if not title or len(title) < 2:
            return None

        # Посилання
        link = ""
        link_tag = link_el or card.select_one("a[href]")
        if link_tag:
            href = link_tag.get("href", "")
            link = BASE_URL + href if href and not href.startswith("http") else href

        # Зображення
        img_el = card.select_one("img")
        image = img_el.get("src", "") if img_el else ""
        if not image and img_el:
            image = img_el.get("data-src", "")

        # Стара ціна: span з класом line-through
        old_price_el = card.select_one("span.line-through, del")
        old_price = _to_float(old_price_el.get_text(strip=True)) if old_price_el else None

        # Нова ціна: div з класами text-lg font-bold
        new_price_el = card.select_one("div.text-lg.font-bold, div.text-xl.font-bold, div[class*='text-lg'][class*='font-bold'], div[class*='text-dark-700'][class*='font-bold']")
        new_price = _to_float(new_price_el.get_text(strip=True)) if new_price_el else None

        # Якщо ціна не знайдена, шукаємо будь-яке число з символом ₴ або грн
        if not new_price:
            for el in card.select("div, span"):
                t = el.get_text(strip=True)
                if ("₴" in t or "грн" in t) and not el.select("span.line-through"):
                    val = _to_float(t)
                    if val:
                        new_price = val
                        break

        # Знижка
        discount_pct = None
        for el in card.select("div, span"):
            cls = " ".join(el.get("class", []))
            style = el.get("style", "")
            text = el.get_text(strip=True)
            if ("FFCCCC" in cls or "FFCCCC" in style or "bg-[#FF" in cls or "badge" in cls.lower()) and "%" in text:
                m = re.search(r"-?(\d+)%", text)
                if m:
                    discount_pct = int(m.group(1))
                    break

        if discount_pct is None and old_price and new_price and old_price > new_price:
            discount_pct = round((1 - new_price / old_price) * 100)

        has_discount = bool(discount_pct and discount_pct > 0)
        saving = round(old_price - new_price, 2) if (old_price and new_price and old_price > new_price) else None
        
        # Об'єм / вага (з назви або з міні-свотчів на картці товару EVA)
        weight = _extract_weight(title)
        if not weight:
            for sw in card.select("[data-testid*='swatch-label'], [class*='swatch'] span, .m-mini-swatches span, .m-mini-swatches div"):
                sw_text = _clean(sw.get_text(strip=True))
                if any(u in sw_text.lower() for u in WEIGHT_UNITS) and re.search(r'\d', sw_text):
                    weight = sw_text
                    break

        # Наявність товару (В наявності / Немає в наявності)
        card_full_text = card.get_text(" ", strip=True).lower()
        is_out_of_stock = (
            "немає в наявності" in card_full_text
            or "немає на складі" in card_full_text
            or ("сповістити" in card_full_text and "до кошика" not in card_full_text)
        )
        in_stock = not is_out_of_stock

        # Замовлення онлайн / тільки на сайті
        is_only_online = (
            "доставка 0" in card_full_text
            or "на сайті" in card_full_text
            or "тільки на сайті" in card_full_text
            or "тільки онлайн" in card_full_text
        )

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
            "link": link,
            "weight": weight,
            "in_stock": in_stock,
            "is_in_stock": in_stock,
            "is_only_online": is_only_online,
            "store": "eva",
        }
    except Exception as exc:
        logger.debug("Помилка парсингу картки EVA: %s", exc)
        return None


def _parse_page(html: str) -> List[Dict[str, Any]]:
    """Парсить усі картки на сторінці EVA."""
    soup = BeautifulSoup(html, "html.parser")
    cards = soup.select(".o-listing-product")
    result = []
    seen = set()
    for card in cards:
        item = _parse_card(card)
        if item:
            key = item.get("product_url") or item.get("title")
            if key not in seen:
                seen.add(key)
                result.append(item)
    return result


# ─────────────────────────────────────────────
#   ПУБЛІЧНЕ API
# ─────────────────────────────────────────────

_campaigns_cache = {
    "timestamp": 0,
    "urls": []
}

def get_eva_promotion_campaigns(timeout: int = REQUEST_TIMEOUT) -> List[str]:
    """
    Отримує список посилань на діючі акції з https://eva.ua/ua/promotion/
    Кешує результат на 15 хвилин.
    """
    global _campaigns_cache
    now = time.time()
    if _campaigns_cache["urls"] and (now - _campaigns_cache["timestamp"] < 900):
        return _campaigns_cache["urls"]

    html = _get(f"{BASE_URL}/ua/promotion/", timeout=timeout)
    if not html:
        return _campaigns_cache["urls"] or []

    matches = re.findall(r'href=[\"\x27](/ua/promotion/[a-z0-9\-]+/)[\"\x27]', html)
    campaigns = [m for m in sorted(list(set(matches))) if not m.startswith("/ua/promotion/type/")]
    if campaigns:
        _campaigns_cache["urls"] = campaigns
        _campaigns_cache["timestamp"] = now
    return campaigns


def get_eva_promos(page: int = 1, timeout: int = REQUEST_TIMEOUT) -> List[Dict[str, Any]]:
    """
    Завантажує всі акційні товари з акційних сторінок EVA (https://eva.ua/ua/promotion/...).
    Підтримує пагінацію по всіх діючих промо-кампаніях EVA.
    """
    campaigns = get_eva_promotion_campaigns(timeout=timeout)
    results = []
    seen = set()

    if campaigns:
        campaigns_per_page = 2
        start_idx = ((page - 1) * campaigns_per_page) % len(campaigns)
        selected_campaigns = campaigns[start_idx : start_idx + campaigns_per_page]

        from concurrent.futures import ThreadPoolExecutor
        def _fetch_camp(camp_path):
            camp_url = BASE_URL + camp_path
            camp_html = _get(camp_url, timeout=timeout)
            if camp_html:
                return _parse_page(camp_html)
            return []

        with ThreadPoolExecutor(max_workers=min(4, len(selected_campaigns))) as ex:
            for items in ex.map(_fetch_camp, selected_campaigns):
                for item in items:
                    key = item.get("product_url") or item.get("title")
                    if key not in seen:
                        seen.add(key)
                        results.append(item)

    # Якщо з кампаній повернулось мало або порожньо — добираємо з категорій знижок
    if len(results) < 20:
        cat_start = ((page - 1) * 2) % len(PROMO_CATEGORIES)
        cats = PROMO_CATEGORIES[cat_start : cat_start + 2]
        for cat_path in cats:
            url = BASE_URL + cat_path
            html = _get(url, timeout=timeout)
            if not html:
                continue
            items = _parse_page(html)
            for item in items:
                key = item.get("product_url") or item.get("title")
                if key not in seen:
                    seen.add(key)
                    results.append(item)

    return results

    return results


def search_eva(query: str, page: int = 1, timeout: int = REQUEST_TIMEOUT) -> List[Dict[str, Any]]:
    """
    Пошук товарів на EVA.UA за запитом.
    """
    if not query:
        return []
    url = f"{BASE_URL}/ua/search/"
    params = {"q": query}
    if page > 1:
        params["page"] = page
    html = _get(url, params=params, timeout=timeout)
    if not html:
        return []
    items = _parse_page(html)
    logger.info("EVA пошук '%s': %d товарів", query, len(items))
    return items
