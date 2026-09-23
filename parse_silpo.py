#!/usr/bin/env python3
"""
Консольний утиліта-парсер товарів супермаркету «Сільпо».
Дозволяє шукати товари, парсити весь асортимент та експортувати результати у JSON, CSV або Excel (XLSX).

Приклади використання:
  python3 parse_silpo.py -q "молоко"
  python3 parse_silpo.py -q "молоко" --all -o молоко_всі.json
  python3 parse_silpo.py -q "молоко" --promo -o молоко_акції.xlsx
  python3 parse_silpo.py -q "сир" --sort price_asc -l 50
"""

import sys
import os
import argparse
import json
import csv
from typing import List, Dict, Any

# Підключаємо локальний модуль silpo_api
from silpo_api import (
    search_products,
    fetch_all_products,
    CITIES_BRANCHES,
    DEFAULT_BRANCH_ID
)


def export_to_csv(products: List[Dict[str, Any]], filepath: str):
    fieldnames = [
        "id", "title", "brand", "price", "old_price", "discount_percent",
        "weight", "unit", "in_stock", "product_url", "image_url"
    ]
    with open(filepath, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        for p in products:
            writer.writerow(p)
    print(f"✅ Збережено {len(products)} товарів у CSV: {filepath}")


def export_to_json(products: List[Dict[str, Any]], filepath: str):
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(products, f, ensure_ascii=False, indent=2)
    print(f"✅ Збережено {len(products)} товарів у JSON: {filepath}")


def export_to_excel(products: List[Dict[str, Any]], filepath: str):
    try:
        import openpyxl
        from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    except ImportError:
        print("⚠️ Бібліотека openpyxl не встановлена. Експортуємо у CSV замість Excel...")
        csv_path = filepath.rsplit(".", 1)[0] + ".csv"
        export_to_csv(products, csv_path)
        return

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Товари Сільпо"

    headers = [
        "Назва товару", "Бренд", "Ціна (грн)", "Стара ціна (грн)",
        "Знижка (%)", "Вага/Об'єм", "Одиниця", "В наявності", "Посилання на Сільпо"
    ]
    ws.append(headers)

    header_fill = PatternFill(start_color="FF5B00", end_color="FF5B00", fill_type="solid")
    header_font = Font(name="Arial", size=11, bold=True, color="FFFFFF")
    align_center = Alignment(horizontal="center", vertical="center")

    for col_num in range(1, len(headers) + 1):
        cell = ws.cell(row=1, column=col_num)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = align_center

    for p in products:
        ws.append([
            p.get("title", ""),
            p.get("brand", ""),
            p.get("price", 0.0),
            p.get("old_price") or "",
            f"{p.get('discount_percent')}%" if p.get("discount_percent") else "",
            p.get("weight", ""),
            p.get("unit", ""),
            "Так" if p.get("in_stock") else "Ні",
            p.get("product_url", "")
        ])

    # Автоматичне вирівнювання ширини стовпчиків
    for col in ws.columns:
        max_len = max(len(str(cell.value or "")) for cell in col)
        col_letter = openpyxl.utils.get_column_letter(col[0].column)
        ws.column_dimensions[col_letter].width = min(max(max_len + 3, 12), 60)

    wb.save(filepath)
    print(f"✅ Збережено {len(products)} товарів у Excel: {filepath}")


def print_table(products: List[Dict[str, Any]]):
    """
    Виводить красиву таблицю товарів у консоль.
    """
    if not products:
        print("\n❌ Товарів не знайдено.")
        return

    print("\n" + "=" * 110)
    print(f"{'№':<3} | {'Назва товару':<48} | {'Ціна':<9} | {'Знижка':<8} | {'Вага/Обʼєм':<10} | {'Бренд':<18}")
    print("=" * 110)

    for idx, p in enumerate(products, 1):
        title = p['title']
        if len(title) > 46:
            title = title[:45] + "…"

        brand = p['brand']
        if len(brand) > 17:
            brand = brand[:16] + "…"

        price_str = f"{p['price']:.2f} грн"
        discount_str = f"-{p['discount_percent']}%" if p.get('discount_percent') else "—"
        weight_str = p.get('weight') or p.get('unit') or "—"

        print(f"{idx:<3} | {title:<48} | {price_str:<9} | {discount_str:<8} | {weight_str:<10} | {brand:<18}")

    print("=" * 110)
    prices = [p["price"] for p in products if p.get("price")]
    if prices:
        avg_price = sum(prices) / len(prices)
        min_price = min(prices)
        max_price = max(prices)
        discounted_count = sum(1 for p in products if p.get("has_discount"))
        print(f"📊 Всього: {len(products)} товарів | Мін: {min_price:.2f} грн | Макс: {max_price:.2f} грн | Сер: {avg_price:.2f} грн | Зі знижкою: {discounted_count}")
    print("=" * 110 + "\n")


def main():
    parser = argparse.ArgumentParser(
        description="Парсер товарів супермаркету «Сільпо» (пошук, викачування, експорт)",
        formatter_class=argparse.RawTextHelpFormatter
    )
    parser.add_argument("-q", "--query", default="молоко", help="Пошуковий запит (за замовчуванням: 'молоко')")
    parser.add_argument("-a", "--all", action="store_true", help="Викачати абсолютно всі знайдені товари (пройти всю пагінацію)")
    parser.add_argument("-l", "--limit", type=int, default=30, help="Кількість товарів для виведення (за замовчуванням: 30)")
    parser.add_argument("--promo", action="store_true", help="Фільтрувати лише акційні товари зі знижкою")
    parser.add_argument("--sort", choices=["popularity", "price_asc", "price_desc"], default="popularity",
                        help="Сортування: popularity, price_asc (дешеві), price_desc (дорогі)")
    parser.add_argument("-c", "--city", default="Київ", help="Місто (Київ, Львів, Одеса, Дніпро, Харків)")
    parser.add_argument("-o", "--output", help="Шлях для збереження файлу (.json, .csv, .xlsx)")

    args = parser.parse_args()

    # Знаходимо branch_id
    branch_id = DEFAULT_BRANCH_ID
    for city_name, data in CITIES_BRANCHES.items():
        if args.city.lower() in city_name.lower():
            branch_id = data["branchId"]
            break

    # Сортування
    sort_by = "popularity"
    sort_direction = "desc"
    if args.sort == "price_asc":
        sort_by = "price"
        sort_direction = "asc"
    elif args.sort == "price_desc":
        sort_by = "price"
        sort_direction = "desc"

    print(f"\n🔍 Пошук у Сільпо за запитом: '{args.query}' (Місто: {args.city})...")

    if args.all:
        print("⏳ Завантажуємо всі сторінки асортименту...")
        products = fetch_all_products(
            query=args.query,
            branch_id=branch_id,
            max_items=1000,
            only_promo=args.promo,
            sort_by=sort_by,
            sort_direction=sort_direction
        )
    else:
        res = search_products(
            query=args.query,
            branch_id=branch_id,
            limit=args.limit,
            only_promo=args.promo,
            sort_by=sort_by,
            sort_direction=sort_direction
        )
        products = res.get("items", [])
        total = res.get("total", len(products))
        print(f"📦 Всього в Сільпо за цим запитом: {total} товарів (показано {len(products)})")

    # Виводимо таблицю у консоль
    print_table(products)

    # Зберігаємо у файл, якщо вказано
    if args.output:
        out = args.output.lower()
        if out.endswith(".json"):
            export_to_json(products, args.output)
        elif out.endswith(".csv"):
            export_to_csv(products, args.output)
        elif out.endswith(".xlsx"):
            export_to_excel(products, args.output)
        else:
            # За замовчуванням json
            export_to_json(products, args.output + ".json")


if __name__ == "__main__":
    main()
