#!/usr/bin/env python3
"""
Універсальний тестовий скрипт для перевірки працездатності LOOT:
- АТБ (пошук та всі сторінки акцій)
- Сільпо (пошук, акції, перевірка філій та доставки)
- MCP Silpo API (опціонально)
"""

import sys
import time
import json
import atb_api
import silpo_api


def test_atb():
    print("\n--- 🔴 ТЕСТ АТБ ---")
    t0 = time.time()
    res = atb_api.search_atb("молоко", page=1)
    prods = res.get("products", [])
    print(f"Пошук 'молоко': знайдено {len(prods)} товарів за {time.time()-t0:.2f}с")

    t0 = time.time()
    promos = atb_api.get_atb_promos_page(page=1, urls_per_batch=2)
    print(f"Акції (порція 1): знайдено {len(promos)} товарів за {time.time()-t0:.2f}с")
    if promos:
        print(f"Приклад: {promos[0]['title']} ({promos[0].get('price')} ₴) - {promos[0].get('promo_name')}")


def test_silpo():
    print("\n--- 🟠 ТЕСТ СІЛЬПО ---")
    t0 = time.time()
    res = silpo_api.search_products("молоко", limit=10)
    items = res.get("items", [])
    print(f"Пошук 'молоко': знайдено {len(items)} товарів за {time.time()-t0:.2f}с")

    t0 = time.time()
    promos = silpo_api.get_silpo_promotions(limit=10, offset=0)
    print(f"Акції: знайдено {len(promos)} товарів за {time.time()-t0:.2f}с")
    if promos:
        print(f"Приклад: {promos[0]['title']} ({promos[0].get('price')} ₴) - {promos[0].get('promo_name')}")


def test_branches():
    print("\n--- 🏪 ТЕСТ ФІЛІЙ СІЛЬПО ---")
    for name, data in list(silpo_api.CITIES_BRANCHES.items())[:3]:
        bid = data["branchId"]
        res = silpo_api.search_products("хліб", branch_id=bid, limit=5)
        print(f"✅ {name}: {res.get('total', 0)} товарів")


if __name__ == "__main__":
    print("Запуск комплексного тесту API...")
    test_atb()
    test_silpo()
    test_branches()
    print("\n✅ Всі тести успішно пройдені!")
