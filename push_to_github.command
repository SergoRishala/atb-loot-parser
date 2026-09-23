#!/bin/bash
cd "$(dirname "$0")"

echo "======================================================"
echo "  🚀 Оновлення репозиторію atb-loot-parser на GitHub  "
echo "======================================================"
echo ""

# Перевірка чи вже є авторизація gh
if ! gh auth status &>/dev/null; then
    echo "🔑 Потрібна швидка авторизація через браузер."
    echo "Скопіюйте 8-значний код нижче, натисніть Enter і підтвердіть у Safari:"
    echo ""
    gh auth login --web -p https
fi

echo ""
echo "⚙️ Підключення облікового запису до Git..."
gh auth setup-git

echo ""
echo "📤 Відправка всіх нових файлів на GitHub..."
git branch -M main
git push -u -f origin main

echo ""
echo "======================================================"
echo "  🎉 Вітаємо! Усі старі файли успішно замінено!       "
echo "  🌐 Посилання: https://github.com/SergoRishala/atb-loot-parser"
echo "======================================================"
echo ""
read -p "Натисніть Enter для виходу..."
