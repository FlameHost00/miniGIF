// generateContent.js
const fs = require('fs');
const path = require('path');

// ===== НАСТРОЙКИ =====
// Путь к папке с данными пользователя
const USER_DATA_PATH = 'C:/Users/tomik/AppData/Roaming/minigif';

// ===== КОНСТАНТЫ =====
const DATA_FILE = path.join(USER_DATA_PATH, 'gif_data.json');
const GIFS_DIR = path.join(USER_DATA_PATH, 'gifs');
const SYSTEM_CATEGORY_ID = 'system_gifs';

// ===== ФУНКЦИИ =====
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

function generateContentFile() {
    console.log('🚀 Генерация файла контента...');
    console.log(`📁 Путь к данным: ${DATA_FILE}`);
    console.log(`📁 Путь к GIF: ${GIFS_DIR}`);
    console.log('');
    
    // Проверяем существование файла данных
    if (!fs.existsSync(DATA_FILE)) {
        console.error('❌ Файл данных не найден!');
        console.log(`Проверьте путь: ${DATA_FILE}`);
        return;
    }
    
    // Загружаем данные
    const data = loadData();
    
    // Получаем элементы системной категории
    const systemItems = data.itemsData[SYSTEM_CATEGORY_ID] || [];
    
    if (systemItems.length === 0) {
        console.log('⚠️ В системной категории нет элементов');
        console.log('Создан пустой файл контента');
    }
    
    // Создаем объект контента
    const content = {
        version: '1.0.0',
        systemGifs: systemItems.map(item => ({
            code: item.code,
            gifId: item.gifId
        }))
    };
    
    // Сохраняем в файл в корне проекта
    const outputPath = path.join(__dirname, 'gifs_content.json');
    fs.writeFileSync(outputPath, JSON.stringify(content, null, 2));
    console.log(`✅ Файл контента сохранен: ${outputPath}`);
    
    // Копируем GIF файлы в папку проекта
    const projectGifsDir = path.join(__dirname, 'gifs');
    if (!fs.existsSync(projectGifsDir)) {
        fs.mkdirSync(projectGifsDir, { recursive: true });
        console.log(`📁 Создана папка: ${projectGifsDir}`);
    }
    
    let copiedCount = 0;
    for (const item of systemItems) {
        const sourcePath = path.join(GIFS_DIR, `${item.gifId}.gif`);
        const destPath = path.join(projectGifsDir, `${item.gifId}.gif`);
        
        if (fs.existsSync(sourcePath)) {
            fs.copyFileSync(sourcePath, destPath);
            copiedCount++;
        } else {
            console.log(`⚠️ GIF не найден: ${item.gifId} (${item.code})`);
        }
    }
    
    console.log(`✅ Скопировано GIF файлов: ${copiedCount}`);
    console.log(`📊 Всего в системной категории: ${systemItems.length} элементов`);
    console.log('');
    console.log('🎉 Генерация завершена!');
    console.log(`📦 Файл контента: ${outputPath}`);
    console.log(`📁 GIF файлы: ${projectGifsDir}`);
}

// Запускаем
generateContentFile();