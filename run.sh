#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

echo "=== Встановлення залежностей ==="
pip3 install -r requirements.txt --quiet

echo "=== Запуск веб-додатка ATB & Сільпо PRO (порт 5050) ==="
python3 app.py
