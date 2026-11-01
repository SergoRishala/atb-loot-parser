#!/bin/bash
# Запуск веб-додатка «ATB & Сільпо PRO: Порівняння цін та Акцій»
cd "$(dirname "$0")"

echo "=================================================="
echo "  🚀 Запуск веб-додатка «ATB & Сільпо PRO»        "
echo "=================================================="

if ! command -v python3 &> /dev/null; then
    echo "❌ Помилка: Python 3 не знайдено на вашому комп'ютері."
    read -p "Натисніть Enter для виходу..."
    exit 1
fi

# Звільняємо порт 5050, якщо він уже зайнятий старим процесом
OLD_PID=$(lsof -ti :5050 2>/dev/null)
if [ -n "$OLD_PID" ]; then
    echo "⚠️ Порт 5050 зайнятий (PID: $OLD_PID). Звільняємо порт..."
    kill -9 $OLD_PID 2>/dev/null || true
    sleep 1
fi

echo "🌐 Відкриваємо веб-додаток у браузері: http://localhost:5050"
python3 app.py
