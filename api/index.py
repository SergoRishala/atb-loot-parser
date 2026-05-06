from flask import Flask, jsonify, request, send_from_directory, Response
from flask_cors import CORS
import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin, quote
import re
import json
import time

app = Flask(__name__, static_folder=".")
CORS(app)

# ═══════════════════════════════════════════════════════
#  КОНСТАНТИ ТА УТИЛІТИ (з вашого Tkinter коду)
# ═══════════════════════════════════════════════════════

BASE_URL = "https://www.atbmarket.com/catalog/economy"
SEARCH_URL = "https://www.atbmarket.com/sch"
LOCATION_ID = "1154"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept-Language": "uk-UA,uk;q=0.9,en;q=0.8",
    "Referer": "https://www.atbmarket.com/",
}

def make_url(page: int) -> str:
    return BASE_URL if page == 1 else f"{BASE_URL}?page={page}"

def make_search_url(query: str, page: int) -> str:
    encoded = quote(query)
    url = f"{SEARCH_URL}?lang=uk&location={LOCATION_ID}&query={encoded}"
    if page > 1:
        url += f"&page={page}"
    return url

def clean(text):
    return " ".join(str(text or "").split())

def to_float(value):
    try:
        value = str(value).replace(",", ".").strip()
        return float(value) if value else None
    except Exception:
        return None

def compute_saving(product):
    price = to_float(product.get("current_price"))
    old = to_float(product.get("old_price"))
    if price is not None and old is not None and old > price:
        return round(old - price, 2)
    return None

# ═══════════════════════════════════════════════════════
#  ПАРСИНГ (Ваша логіка BeautifulSoup)
# ═══════════════════════════════════════════════════════

def get_value(card, selector):
    tag = card.select_one(selector)
    if not tag: return ""
    return tag.get("value", "") or ""

def get_text_tag(card, selector):
    tag = card.select_one(selector)
    return clean(tag.get_text(" ")) if tag else ""

def parse_products_from_html(html: str, base: str = BASE_URL):
    soup = BeautifulSoup(html, "html.parser")
    cards = soup.select("article.catalog-item")
    products = []

    for card in cards:
        title_tag = card.select_one(".catalog-item__title a")
        img_tag = card.select_one(".catalog-item__photo img")
        photo_link = card.select_one(".catalog-item__photo-link")

        title = clean(title_tag.get_text(" ")) if title_tag else ""
        if not title and img_tag:
            title = clean(img_tag.get("alt", ""))

        img_url = ""
        if img_tag:
            img_url = (img_tag.get("data-src") or img_tag.get("data-lazy-src") or img_tag.get("src") or "")
            if img_url and not img_url.startswith("http"):
                img_url = urljoin(base, img_url)

        link = ""
        if title_tag and title_tag.get("href"):
            link = urljoin(base, title_tag["href"])
        elif photo_link and photo_link.get("href"):
            link = urljoin(base, photo_link["href"])

        curr_p = get_value(card, "data.product-price__top")
        old_p  = get_value(card, "data.product-price__bottom")
        atb_p  = get_value(card, "data.atbcard-sale__price-top")

        discount = get_text_tag(card, ".catalog-item__labels")
        if not discount:
            label = card.select_one(".custom-product-label")
            if label:
                discount = clean(label.get_text(" ") or label.get("data-tippy-content", ""))

        if title and (curr_p or atb_p):
            p = {
                "title": title,
                "current_price": curr_p,
                "old_price": old_p,
                "atb_card_price": atb_p,
                "discount": discount,
                "is_atb_card": bool(atb_p),
                "link": link,
                "img_url": img_url
            }
            p["saving"] = compute_saving(p)
            products.append(p)
    return products

def get_total_pages_from_html(html: str) -> int:
    soup = BeautifulSoup(html, "html.parser")
    pages = []
    for a in soup.select("a.pagination__item, .pagination a, [class*='paginat'] a"):
        try: pages.append(int(a.get_text(strip=True)))
        except: pass
    if pages: return max(pages)
    return 1

# ═══════════════════════════════════════════════════════
#  МАРШРУТИ
# ═══════════════════════════════════════════════════════

# ЦЕЙ БЛОК БІЛЬШЕ НЕ ПОТРІБЕН НА VERCEL
# @app.route("/")
# def index():
#     return send_from_directory(".", "index.html")

@app.route("/api/catalog/page/<int:page>")
def api_catalog_page(page):
    try:
        url = make_url(page)
        resp = requests.get(url, headers=HEADERS, timeout=20)
        resp.raise_for_status()
        products = parse_products_from_html(resp.text)
        return jsonify({"products": products, "page": page, "count": len(products)})
    except Exception as e:
        return jsonify({"products": [], "error": str(e)}), 200

@app.route("/api/search/page") # Тепер відповідає вашому JS (fireSmartSearch)
def api_search_page():
    query = request.args.get("q", "").strip()
    page = int(request.args.get("page", 1))
    if not query:
        return jsonify({"products": [], "total_pages": 1})

    try:
        url = make_search_url(query, page)
        resp = requests.get(url, headers=HEADERS, timeout=20)
        resp.raise_for_status()

        products = parse_products_from_html(resp.text, base="https://www.atbmarket.com")
        total_p = get_total_pages_from_html(resp.text)

        return jsonify({
            "products": products,
            "page": page,
            "total_pages": total_p,
            "count": len(products)
        })
    except Exception as e:
        return jsonify({"products": [], "error": str(e)}), 200

@app.route("/api/details")
def api_details():
    url = request.args.get("url")
    if not url:
        return jsonify({"error": "No URL provided"}), 400
    try:
        resp = requests.get(url, headers=HEADERS, timeout=10)
        soup = BeautifulSoup(resp.text, "html.parser")
        chars = {}
        # Шукаємо рядки таблиці характеристик
        items = soup.select(".product-characteristics__item")
        for item in items:
            name_tag = item.select_one(".product-characteristics__name")
            val_tag = item.select_one(".product-characteristics__value")
            if name_tag and val_tag:
                name = name_tag.get_text(strip=True)
                val = val_tag.get_text(strip=True)
                chars[name] = val
        return jsonify(chars)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(debug=True, port=5000)