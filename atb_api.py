"""
Модуль прямого парсингу інтернет-магазину мережі супермаркетів «АТБ» (atbmarket.com).
Підтримує пошук товарів, каталог акцій «Економія», отримання характеристик товару
та розрахунок знижок та економії.
"""

import urllib.request
import urllib.parse
from bs4 import BeautifulSoup
import re
from typing import Dict, List, Any, Optional

BASE_URL = "https://www.atbmarket.com/catalog/economy"
SEARCH_URL = "https://www.atbmarket.com/sch"
LOCATION_ID = "1154"  # Стандартна локація (Київ/Україна)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept-Language": "uk-UA,uk;q=0.9,en;q=0.8",
    "Referer": "https://www.atbmarket.com/",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
}


def clean_text(text: Optional[str]) -> str:
    return " ".join(str(text or "").split())


def to_float(value: Any) -> Optional[float]:
    try:
        val_str = str(value or "").replace(",", ".").strip()
        f = float(val_str)
        return f if f >= 0 else None
    except Exception:
        return None


def extract_discount_percent(discount_text: str, current_price: Optional[float], old_price: Optional[float]) -> Optional[int]:
    """Витягує або розраховує процент знижки."""
    if discount_text:
        m = re.search(r"-?(\d+)%", discount_text)
        if m:
            return int(m.group(1))
    if current_price and old_price and old_price > current_price:
        return round((1 - (current_price / old_price)) * 100)
    return None


def parse_products_from_html(html: str, base: str = "https://www.atbmarket.com") -> List[Dict[str, Any]]:
    """
    Парсить картки товарів АТБ зі сторінки HTML та нормалізує їх до уніфікованого формату.
    """
    soup = BeautifulSoup(html, "html.parser")
    cards = soup.select("article.catalog-item")
    products = []

    for card in cards:
        title_tag = card.select_one(".catalog-item__title a")
        img_tag = card.select_one(".catalog-item__photo img")
        photo_link = card.select_one(".catalog-item__photo-link")

        title = clean_text(title_tag.get_text(" ")) if title_tag else ""
        if not title and img_tag:
            title = clean_text(img_tag.get("alt", ""))

        img_url = ""
        if img_tag:
            img_url = (img_tag.get("data-src") or img_tag.get("data-lazy-src") or img_tag.get("src") or "")
            if img_url and not img_url.startswith("http"):
                img_url = urllib.parse.urljoin(base, img_url)

        link = ""
        if title_tag and title_tag.get("href"):
            link = urllib.parse.urljoin(base, title_tag["href"])
        elif photo_link and photo_link.get("href"):
            link = urllib.parse.urljoin(base, photo_link["href"])

        # Ціни
        curr_price_tag = card.select_one("data.product-price__top")
        old_price_tag = card.select_one("data.product-price__bottom")
        atb_card_price_tag = card.select_one("data.atbcard-sale__price-top")

        curr_p = to_float(curr_price_tag.get("value", "") if curr_price_tag else "")
        old_p = to_float(old_price_tag.get("value", "") if old_price_tag else "")
        atb_p = to_float(atb_card_price_tag.get("value", "") if atb_card_price_tag else "")

        # Якщо є ціна з карткою АТБ і немає звичайної, ставимо її
        final_price = curr_p if curr_p is not None else atb_p
        if final_price is None:
            continue

        # Знижка та бейджі
        discount_tag = card.select_one(".catalog-item__labels")
        discount_text = clean_text(discount_tag.get_text(" ")) if discount_tag else ""
        if not discount_text:
            label = card.select_one(".custom-product-label")
            if label:
                discount_text = clean_text(label.get_text(" ") or label.get("data-tippy-content", ""))

        discount_percent = extract_discount_percent(discount_text, final_price, old_p)
        saving = round(old_p - final_price, 2) if (old_p and old_p > final_price) else 0.0

        # Витягуємо фасування/вагу з назви (напр. "0,9 кг", "440 г", "1 л")
        weight_match = re.search(r"(\d+[\.,]?\d*\s*(?:кг|г|л|мл|шт))", title, re.IGNORECASE)
        weight = weight_match.group(1).replace(",", ".") if weight_match else ""

        # Визначаємо бренд з назви
        brand_match = re.search(r"(?:«([^»]+)»|\"([^\"]+)\")", title)
        brand = brand_match.group(1) or brand_match.group(2) if brand_match else ""

        # Уніфікований об'єкт товару
        products.append({
            "id": f"atb_{len(products)}_{hash(link or title)}",
            "store": "atb",
            "store_name": "АТБ",
            "store_badge": "bg-red-600 text-white",
            "title": title,
            "brand": brand,
            "price": final_price,
            "old_price": old_p,
            "discount_percent": discount_percent,
            "has_discount": bool(discount_percent and discount_percent > 0),
            "saving": saving,
            "is_special_card": bool(atb_p is not None and atb_p > 0),
            "special_card_name": "Картка АТБ" if atb_p else None,
            "special_price": atb_p,
            "weight": weight,
            "unit": "шт",
            "in_stock": True,
            "image_url": img_url,
            "image_large_url": img_url,
            "product_url": link,
            "link": link,
            "promo_name": "Економія" if (discount_percent or saving > 0) else None
        })

    return products


def search_atb(query: str, page: int = 1, timeout: int = 15) -> Dict[str, Any]:
    """
    Здійснює пошук товарів на atbmarket.com.
    """
    encoded = urllib.parse.quote(query.strip())
    url = f"{SEARCH_URL}?lang=uk&location={LOCATION_ID}&query={encoded}"
    if page > 1:
        url += f"&page={page}"

    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            html = resp.read().decode("utf-8")
    except Exception as e:
        return {"products": [], "total": 0, "error": str(e)}

    products = parse_products_from_html(html)
    return {
        "products": products,
        "total": len(products),
        "page": page
    }


def get_atb_catalog(page: int = 1, timeout: int = 15) -> Dict[str, Any]:
    """
    Завантажує сторінку каталогу акцій «Економія» АТБ.
    """
    url = BASE_URL if page == 1 else f"{BASE_URL}?page={page}"
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            html = resp.read().decode("utf-8")
    except Exception as e:
        return {"products": [], "total": 0, "error": str(e)}

    products = parse_products_from_html(html)
    return {
        "products": products,
        "total": len(products),
        "page": page
    }


def get_atb_details(url: str, timeout: int = 10) -> Dict[str, str]:
    """
    Парсить характеристики товару з його персональної сторінки на atbmarket.com.
    """
    if not url:
        return {}

    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            html = resp.read().decode("utf-8")
        soup = BeautifulSoup(html, "html.parser")
        chars = {}
        items = soup.select(".product-characteristics__item")
        for item in items:
            name_tag = item.select_one(".product-characteristics__name")
            val_tag = item.select_one(".product-characteristics__value")
            if name_tag and val_tag:
                name = clean_text(name_tag.get_text(strip=True))
                val = clean_text(val_tag.get_text(strip=True))
                if name and val:
                    chars[name] = val
        return chars
    except Exception:
        return {}


# ══════════════════════════════════════════════════════════════════════════════
#   ПОВНИЙ СПИСОК ВСІХ АКЦІЙНИХ СТОРІНОК АТБ:
#   - Економія (1-4)
#   - Товари зі знижкою / sale_tovari (1-19)
#   - Знижки / znyzhky (1-17)
#   - Програма лояльності / loyalty (1-17)
#   - Власна торгова марка / vtm (1-15)
# ══════════════════════════════════════════════════════════════════════════════
ATB_PROMO_CONFIG = [
    ("Економія", "https://www.atbmarket.com/promo/economy", 4),
    ("Знижки", "https://www.atbmarket.com/promo/sale_tovari", 19),
    ("Знижки", "https://www.atbmarket.com/promo/znyzhky", 17),
    ("Лояльність", "https://www.atbmarket.com/promo/loyalty", 17),
    ("Власна марка", "https://www.atbmarket.com/promo/vtm", 15),
]

ATB_ALL_PROMO_URLS = []
for p_label, p_base, p_max in ATB_PROMO_CONFIG:
    for page_num in range(1, p_max + 1):
        target_url = p_base if page_num == 1 else f"{p_base}?page={page_num}"
        ATB_ALL_PROMO_URLS.append((p_label, target_url))


def get_atb_promos_page(page: int = 1, urls_per_batch: int = 2, timeout: int = 12) -> List[Dict[str, Any]]:
    """
    Завантажує конкретну порцію акцій АТБ із загального списку всіх акційних сторінок.
    На кожну сторінку видачі бере 2 сторінки каталогу АТБ (~50-70 товарів).
    """
    from concurrent.futures import ThreadPoolExecutor

    start_idx = (page - 1) * urls_per_batch
    end_idx = start_idx + urls_per_batch

    if start_idx >= len(ATB_ALL_PROMO_URLS):
        return []

    batch_targets = ATB_ALL_PROMO_URLS[start_idx:end_idx]

    def _fetch_target(item):
        label, url = item
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                prods = parse_products_from_html(resp.read().decode("utf-8"))
                for p in prods:
                    if not p.get("promo_name"):
                        p["promo_name"] = label
                return prods
        except Exception as e:
            print(f"Помилка завантаження АТБ {url}: {e}")
            return []

    with ThreadPoolExecutor(max_workers=len(batch_targets)) as executor:
        results = list(executor.map(_fetch_target, batch_targets))

    combined = []
    seen = set()
    for batch in results:
        for p in batch:
            key = p.get("title") or p.get("link")
            if key and key not in seen:
                seen.add(key)
                combined.append(p)

    return combined


def get_atb_promos(pages=(1, 2, 3), include_loyalty: bool = True, timeout: int = 12) -> List[Dict[str, Any]]:
    """
    Сумісність: завантажує перші сторінки акцій.
    """
    return get_atb_promos_page(page=1, urls_per_batch=2, timeout=timeout)
