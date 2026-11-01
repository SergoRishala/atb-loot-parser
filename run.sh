#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

echo "=== Встановлення залежностей ==="
pip3 install -r requirements.txt --quiet

# Звільняємо порт 5050, якщо він уже зайнятий старим процесом
OLD_PID=$(lsof -ti :5050 2>/dev/null)
if [ -n "$OLD_PID" ]; then
    echo "⚠️ Порт 5050 зайнятий (PID: $OLD_PID). Звільняємо порт..."
    kill -9 $OLD_PID 2>/dev/null || true
    sleep 1
fi

echo "=== Запуск веб-додатка ATB & Сільпо PRO (порт 5050) ==="
python3 app.py
