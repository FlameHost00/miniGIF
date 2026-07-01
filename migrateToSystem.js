// migrateToSystem.js
const fs = require('fs');
const path = require('path');

// ===== НАСТРОЙКИ =====
// Точный путь к папке с данными
const USER_DATA_PATH = 'C:/Users/tomik/AppData/Roaming/minigif';

// ===== КОНСТАНТЫ =====
const DATA_FILE = path.join(USER_DATA_PATH, 'gif_data.json');
const GIFS_DIR = path.join(USER_DATA_PATH, 'gifs');

const SYSTEM_CATEGORY_ID = 'system_gifs';

// ===== ФУНКЦИИ =====
function generateId() {
    return Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function loadData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const rawData = fs.readFileSync(DATA_FILE, 'utf-8');
            return JSON.parse(rawData);
        }
    } catch (error) {
        console.error('Error loading data:', error);
    }
    return { categories: [], itemsData: {}, gifs: {} };
}

function saveData(data) {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        return true;
    } catch (error) {
        console.error('Error saving data:', error);
        return false;
    }
}

function getGifPath(gifId) {
    return path.join(GIFS_DIR, `${gifId}.gif`);
}

// ===== ОСНОВНАЯ ФУНКЦИЯ =====
async function migrateToSystem() {
    console.log('🚀 Начинаем миграцию GIF в системную категорию...');
    console.log(`📁 Путь к данным: ${DATA_FILE}`);
    console.log(`📁 Путь к GIF: ${GIFS_DIR}`);
    console.log('');
    
    // Проверяем существование папки
    if (!fs.existsSync(USER_DATA_PATH)) {
        console.error(`❌ Папка не найдена: ${USER_DATA_PATH}`);
        console.log('Проверьте, существует ли папка с данными приложения');
        return;
    }
    
    // Проверяем существование файла данных
    if (!fs.existsSync(DATA_FILE)) {
        console.error('❌ Файл данных не найден!');
        console.log(`Проверьте путь: ${DATA_FILE}`);
        console.log('\nСписок файлов в папке:');
        try {
            const files = fs.readdirSync(USER_DATA_PATH);
            files.forEach(file => console.log(`  - ${file}`));
        } catch (err) {
            console.log('Не удалось прочитать папку');
        }
        return;
    }
    
    // Загружаем данные
    console.log('📖 Загрузка данных...');
    const data = loadData();
    console.log(`📊 Найдено категорий: ${data.categories.length}`);
    
    // Проверяем, есть ли системная категория
    let systemCategory = data.categories.find(c => c.id === SYSTEM_CATEGORY_ID);
    if (!systemCategory) {
        console.log('📦 Системная категория не найдена, создаем...');
        systemCategory = {
            id: SYSTEM_CATEGORY_ID,
            name: '📦 Системные GIF',
            key: 'system-gifs',
            color: '#6c5ce7',
            isSystem: true
        };
        data.categories.unshift(systemCategory);
        data.itemsData[SYSTEM_CATEGORY_ID] = [];
        console.log('✅ Системная категория создана');
    } else {
        console.log(`✅ Системная категория найдена: ${systemCategory.name}`);
    }
    
    // Получаем существующие элементы в системной категории
    const existingItems = data.itemsData[SYSTEM_CATEGORY_ID] || [];
    const existingCodes = new Set(existingItems.map(item => item.code));
    console.log(`📦 В системной категории уже: ${existingItems.length} элементов`);
    console.log('');
    
    let addedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    
    // Проходим по всем категориям (кроме системной)
    for (const categoryId in data.itemsData) {
        if (categoryId === SYSTEM_CATEGORY_ID) continue;
        
        const items = data.itemsData[categoryId] || [];
        if (items.length === 0) continue;
        
        const categoryName = data.categories.find(c => c.id === categoryId)?.name || categoryId;
        console.log(`📁 Обработка категории: ${categoryName} (${items.length} элементов)`);
        
        for (const item of items) {
            // Проверяем, нет ли уже такого кода в системной категории
            if (existingCodes.has(item.code)) {
                console.log(`  ⏭️ Пропуск: ${item.code} (уже существует в системной)`);
                skippedCount++;
                continue;
            }
            
            // Создаем новый GIF ID
            const newGifId = `gif_${generateId()}`;
            
            // Копируем файл GIF
            const oldPath = getGifPath(item.gifId);
            const newPath = getGifPath(newGifId);
            
            if (fs.existsSync(oldPath)) {
                try {
                    fs.copyFileSync(oldPath, newPath);
                    console.log(`  ✅ Скопирован: ${item.code}`);
                } catch (err) {
                    console.log(`  ❌ Ошибка копирования: ${item.code} - ${err.message}`);
                    errorCount++;
                    continue;
                }
            } else {
                console.log(`  ⚠️ Файл не найден: ${item.gifId}, создаем без GIF`);
            }
            
            // Добавляем в системную категорию
            existingItems.push({
                code: item.code,
                gifId: newGifId
            });
            existingCodes.add(item.code);
            addedCount++;
        }
    }
    
    // Сохраняем данные
    console.log('');
    console.log('💾 Сохранение данных...');
    data.itemsData[SYSTEM_CATEGORY_ID] = existingItems;
    saveData(data);
    
    console.log('\n' + '='.repeat(50));
    console.log('✅ Миграция завершена!');
    console.log(`📊 Добавлено: ${addedCount} элементов`);
    console.log(`⏭️ Пропущено (дубликаты): ${skippedCount} элементов`);
    console.log(`❌ Ошибок: ${errorCount}`);
    console.log(`📦 Всего в системной категории: ${existingItems.length} элементов`);
    console.log('='.repeat(50));
    
    // Показываем все категории с количеством элементов
    console.log('\n📋 Итоговое состояние категорий:');
    for (const category of data.categories) {
        const count = data.itemsData[category.id]?.length || 0;
        const isSystem = category.isSystem ? ' 🔒' : '';
        console.log(`  ${category.name}${isSystem}: ${count} элементов`);
    }
}

// Запускаем миграцию
migrateToSystem().catch(console.error);