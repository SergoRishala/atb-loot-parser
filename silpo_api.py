"""
Модуль прямого парсингу каталогу супермаркету «Сільпо».
Підтримує пошук товарів, пагінацію, фільтри за ціною та знижками,
отримання детальної інформації про товар (attributeGroups, склад,
акції «Цінотижики») та уніфікований формат для порівняння з АТБ.
"""

import urllib.request
import urllib.parse
import json
import time
from typing import Dict, List, Any, Optional

ECOM_BASE = "https://sf-ecom-api.silpo.ua"
IMAGES_BASE = "https://images.silpo.ua"
SILPO_STORE_BASE = "https://silpo.ua"

DEFAULT_HEADERS = {
    "Accept": "application/json",
    "Accept-Language": "uk,en;q=0.9",
    "Origin": "https://silpo.ua",
    "Referer": "https://silpo.ua/",
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36"
    )
}

CITIES_BRANCHES = {
    "Львів (пл. Соборна, 14-15 / Центр)": {
        "branchId": "1edb7351-d076-60fe-a545-51c4e9ef1e54",
        "city": "Львів",
        "address": "пл. Соборна, 14-15",
        "deliveryType": "DeliveryHome"
    },
    "Львів (просп. Червоної Калини, 62 / Сихів)": {
        "branchId": "1edb6b5f-e651-6e90-87e8-0f3d58dec197",
        "city": "Львів",
        "address": "просп. Червоної Калини, 62",
        "deliveryType": "DeliveryHome"
    },
    "Київ (вул. Басейна, 6 / Центр)": {
        "branchId": "1edb6b38-214b-66d6-a8e0-7f2fdd178564",
        "city": "Київ",
        "address": "вул. Басейна, 6",
        "deliveryType": "DeliveryHome"
    },
    "Київ (вул. Ярославська, 56а / Поділ)": {
        "branchId": "1f0ad8d6-ef99-60d4-b6ed-cf102ff76665",
        "city": "Київ",
        "address": "вул. Ярославська, 56а",
        "deliveryType": "DeliveryHome"
    },
    "Одеса (просп. Семафорний, 4 / Darkstore)": {
        "branchId": "1efb8679-1983-63d2-be56-fb14d024cc4c",
        "city": "Одеса",
        "address": "просп. Семафорний, 4",
        "deliveryType": "DeliveryHome"
    },
    "Дніпро (вул. Європейська, 18А / Центр)": {
        "branchId": "1edb735f-9da6-606c-8fe5-51c4e9ef1e54",
        "city": "Дніпро",
        "address": "вул. Європейська, 18А",
        "deliveryType": "DeliveryHome"
    },
    "Харків (вул. Григорія Сковороди, 2А / Центр)": {
        "branchId": "1edb7337-7862-6e0e-af73-d5cf071d641d",
        "city": "Харків",
        "address": "вул. Григорія Сковороди, 2А",
        "deliveryType": "DeliveryHome"
    }
}

DEFAULT_BRANCH_ID = CITIES_BRANCHES["Львів (пл. Соборна, 14-15 / Центр)"]["branchId"]
BACKUP_BRANCH_ID = CITIES_BRANCHES["Київ (вул. Басейна, 6 / Центр)"]["branchId"]


def get_image_url(icon: Optional[str], size: str = "300x300") -> str:
    if not icon:
        return "https://silpo.ua/assets/images/placeholder.svg"
    return f"{IMAGES_BASE}/products/{size}/webp/{icon}"


def normalize_product(item: Dict[str, Any]) -> Dict[str, Any]:
    price = item.get("price") or 0.0
    old_price = item.get("oldPrice")
    discount_percent = None

    if old_price and old_price > price:
        discount_percent = round((1 - (price / old_price)) * 100)

    icon = item.get("icon")
    slug = item.get("slug") or ""
    product_url = f"{SILPO_STORE_BASE}/product/{slug}" if slug else ""

    display_ratio = item.get("displayRatio") or ""
    unit = item.get("ratio") or "шт"
    saving = round(old_price - price, 2) if (old_price and old_price > price) else 0.0

    return {
        "id": item.get("id"),
        "store": "silpo",
        "store_name": "Сільпо",
        "store_badge": "bg-orange-500 text-white",
        "title": item.get("title", "").strip(),
        "brand": item.get("brandTitle") or item.get("brand") or "",
        "price": round(float(price), 2),
        "old_price": round(float(old_price), 2) if old_price else None,
        "discount_percent": discount_percent,
        "has_discount": bool(discount_percent and discount_percent > 0),
        "saving": saving,
        "is_special_card": False,
        "special_card_name": None,
        "special_price": None,
        "weight": display_ratio,
        "unit": unit,
        "icon": icon,
        "image_url": get_image_url(icon, "300x300"),
        "image_large_url": get_image_url(icon, "600x600"),
        "slug": slug,
        "product_url": product_url,
        "link": product_url,
        "stock": item.get("stock", 0),
        "in_stock": bool(item.get("stock", 1) > 0),
        "rating": item.get("guestProductRating"),
        "rating_count": item.get("guestProductRatingCount", 0),
        "category_slug": item.get("sectionSlug"),
        "branch_id": item.get("branchId"),
        "promo_name": "Цінотижики" if (discount_percent or saving > 0) else None
    }


def search_products(
    query: str,
    branch_id: str = DEFAULT_BRANCH_ID,
    limit: int = 24,
    offset: int = 0,
    sort_by: str = "popularity",
    sort_direction: str = "desc",
    in_stock: bool = False,
    only_promo: bool = False,
    timeout: int = 15
) -> Dict[str, Any]:
    params = {
        "limit": limit,
        "offset": offset,
        "search": query,
        "sortBy": sort_by,
        "sortDirection": sort_direction
    }

    if only_promo:
        params["hasPromotions"] = "true"

    qs = urllib.parse.urlencode(params)
    url = f"{ECOM_BASE}/v1/uk/branches/{branch_id}/products?{qs}"

    req = urllib.request.Request(url, headers=DEFAULT_HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"Silpo API error {e.code}: {body}") from e
    except Exception as e:
        raise RuntimeError(f"Network error querying Silpo: {e}") from e

    items_raw = data.get("items", [])
    total = data.get("total", len(items_raw))

    if total == 0 and branch_id != BACKUP_BRANCH_ID and offset == 0:
        backup_url = f"{ECOM_BASE}/v1/uk/branches/{BACKUP_BRANCH_ID}/products?{qs}"
        try:
            with urllib.request.urlopen(urllib.request.Request(backup_url, headers=DEFAULT_HEADERS), timeout=timeout) as b_resp:
                b_data = json.loads(b_resp.read().decode("utf-8"))
                if b_data.get("total", 0) > 0:
                    data = b_data
                    items_raw = data.get("items", [])
                    total = data.get("total", len(items_raw))
        except Exception:
            pass

    products = [normalize_product(it) for it in items_raw]
    if in_stock:
        products = [p for p in products if p["in_stock"]]

    return {
        "query": query,
        "total": total,
        "limit": limit,
        "offset": offset,
        "count": len(products),
        "branch_id": branch_id,
        "items": products
    }


def fetch_all_products(
    query: str,
    branch_id: str = DEFAULT_BRANCH_ID,
    max_items: int = 500,
    only_promo: bool = False,
    sort_by: str = "popularity",
    sort_direction: str = "desc",
    sleep_between_pages: float = 0.2
) -> List[Dict[str, Any]]:
    all_products = []
    offset = 0
    limit = 48

    while len(all_products) < max_items:
        res = search_products(
            query=query,
            branch_id=branch_id,
            limit=limit,
            offset=offset,
            sort_by=sort_by,
            sort_direction=sort_direction,
            only_promo=only_promo
        )
        items = res.get("items", [])
        if not items:
            break

        all_products.extend(items)
        total = res.get("total", len(all_products))

        if len(all_products) >= total or len(items) < limit:
            break

        offset += limit
        time.sleep(sleep_between_pages)

    return all_products[:max_items]


def get_product_details(
    slug: str,
    branch_id: str = DEFAULT_BRANCH_ID,
    timeout: int = 15
) -> Dict[str, Any]:
    encoded_slug = urllib.parse.quote(slug)
    url = f"{ECOM_BASE}/v1/uk/branches/{branch_id}/products/{encoded_slug}"

    req = urllib.request.Request(url, headers=DEFAULT_HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        raise RuntimeError(f"Failed to fetch product details for {slug}: {e}") from e

    nutrition = {
        "calories": None,
        "protein": None,
        "fat": None,
        "carbohydrates": None
    }
    description = ""
    ingredients = ""
    country = data.get("countryOfOrigin") or ""
    brand = data.get("brandTitle") or data.get("brand") or ""
    chars_table = {}

    for group in data.get("attributeGroups", []):
        key = group.get("key")
        tag = group.get("tag", "")
        attrs = group.get("attributes", [])

        for a in attrs:
            attr_title = a.get("attribute", {}).get("title")
            val_title = a.get("value", {}).get("title")
            if attr_title and val_title:
                chars_table[attr_title] = str(val_title)

        if key == "nutrient":
            for a in attrs:
                k = a.get("attribute", {}).get("key")
                val = a.get("value", {}).get("title")
                if k == "calorie":
                    nutrition["calories"] = val
                elif k == "proteins":
                    nutrition["protein"] = val
                elif k == "fats":
                    nutrition["fat"] = val
                elif k == "carbohydrates":
                    nutrition["carbohydrates"] = val

        elif key == "description":
            for a in attrs:
                val = a.get("value", {}).get("title")
                if val and not description:
                    description = val

        elif key in ("ingredients", "composition"):
            for a in attrs:
                val = a.get("value", {}).get("title")
                if val and not ingredients:
                    ingredients = val

        elif key == "generalInfo":
            for a in attrs:
                k = a.get("attribute", {}).get("key")
                val = a.get("value", {}).get("title")
                if k == "country" and val and not country:
                    country = val
                elif k == "brand" and val and not brand:
                    brand = val

    raw_desc = data.get("description")
    if raw_desc and raw_desc.strip() not in ("no desc yet", "no desc"):
        final_desc = raw_desc.strip()
    else:
        final_desc = description or ingredients or ""

    promos_list = []
    for promo in data.get("promotionsDetails", []):
        pname = promo.get("name")
        pdesc = promo.get("description")
        if pname:
            promos_list.append({"name": pname, "description": pdesc})

    normalized = normalize_product(data)
    normalized.update({
        "description": final_desc,
        "ingredients": ingredients or final_desc,
        "country": country or "Україна",
        "brand": brand or normalized.get("brand", ""),
        "nutrition": nutrition,
        "characteristics": chars_table,
        "promotions_details": promos_list,
        "promo_name": promos_list[0]["name"] if promos_list else None,
        "media": [
            get_image_url(m, "600x600") for m in (data.get("media") or [])
        ]
    })
    return normalized


def get_silpo_promotions(branch_id: str = DEFAULT_BRANCH_ID, limit: int = 50, offset: int = 0, timeout: int = 15) -> List[Dict[str, Any]]:
    """
    Отримує сторінку актуальних акційних товарів Сільпо:
    «Цінотижики», «Цінодіджики», «Знижконики», «Акції власного імпорту», «Гуртом дешевше», «Гарбузики» та всі інші акції.
    """
    url = f"{ECOM_BASE}/v1/uk/branches/{branch_id}/products?limit={limit}&mustHavePromotion=true&sortBy=popularity&sortDirection=desc&offset={offset}"
    req = urllib.request.Request(url, headers=DEFAULT_HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            items = data.get("items", [])
            normalized = []
            promo_name_map = {
                "cinotyzhyky": "Цінотижики",
                "cinodidjiky": "Цінодіджики",
                "znyzhkonyky": "Знижконики",
                "akciyi-vlasnogo-importu": "Власний імпорт",
                "vlasny-import": "Власний імпорт",
                "melkoopt": "Гуртом дешевше",
                "harbuzyky": "Гарбузики",
                "only_online": "Тільки Онлайн",
                "kupuy-zaoshchadzhuy": "Купуй та заощаджуй",
                "pakunok-shkolyara": "Пакунок школяра",
                "dobri-promo": "Добрі промо"
            }

            for it in items:
                p = normalize_product(it)
                promos = it.get("promotions") or []
                promo_ids = [pr.get("id") for pr in promos if isinstance(pr, dict)]
                found_name = None
                for pid in promo_ids:
                    if pid in promo_name_map:
                        found_name = promo_name_map[pid]
                        break
                if found_name:
                    p["promo_name"] = found_name
                elif not p.get("promo_name"):
                    p["promo_name"] = "Акція"

                p["is_target_promo"] = True
                normalized.append(p)

            return normalized
    except Exception as e:
        print(f"Помилка завантаження акцій Сільпо (offset {offset}): {e}")
        return []


def search_silpo_barcode(barcode: str, branch_id: str = DEFAULT_BRANCH_ID, timeout: int = 15) -> List[Dict[str, Any]]:
    """Шукає товар у Сільпо за точним штрихкодом (EAN-13) через searchV2."""
    code = barcode.strip()
    url = f"{ECOM_BASE}/v1/uk/branches/{branch_id}/products?searchV2={code}"
    req = urllib.request.Request(url, headers=DEFAULT_HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return [normalize_product(it) for it in data.get("items", [])]
    except Exception as e:
        print(f"Помилка пошуку за штрихкодом у Сільпо: {e}")
        return []

