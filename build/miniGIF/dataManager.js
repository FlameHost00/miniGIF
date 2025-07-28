const { app } = require('electron');
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(app.getPath('userData'), 'gif_data.json');
const BACKUP_DIR = path.join(app.getPath('userData'), 'backups');
const GIFS_DIR = path.join(app.getPath('userData'), 'gifs');

// Создаем необходимые директории
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
if (!fs.existsSync(GIFS_DIR)) fs.mkdirSync(GIFS_DIR, { recursive: true });

function exportWithFiles(data, targetDir) {
    try {
        // Копируем все GIF файлы
        const gifFiles = fs.readdirSync(GIFS_DIR);
        gifFiles.forEach(file => {
            if (file.endsWith('.gif')) {
                fs.copyFileSync(
                    path.join(GIFS_DIR, file),
                    path.join(targetDir, file)
                );
            }
        });

        // Сохраняем данные
        fs.writeFileSync(
            path.join(targetDir, 'data.json'),
            JSON.stringify(data, null, 2)
        );

        return true;
    } catch (error) {
        console.error('Error exporting with files:', error);
        return false;
    }
}


function mergeData(newData) {
    const currentData = loadData();

    // Объединяем категории (с проверкой дубликатов по ID)
    const mergedCategories = [...currentData.categories];
    newData.categories.forEach(newCat => {
        const exists = mergedCategories.some(cat => cat.id === newCat.id);
        if (!exists) {
            mergedCategories.push(newCat);
        } else {
            console.warn(`Категория с ID ${newCat.id} уже существует, пропускаем`);
        }
    });

    // Объединяем itemsData с проверкой дубликатов GIF
    const mergedItemsData = { ...currentData.itemsData };
    for (const [catId, items] of Object.entries(newData.itemsData)) {
        if (!mergedItemsData[catId]) {
            mergedItemsData[catId] = [];
        }

        const existingGifs = new Set(mergedItemsData[catId].map(item => item.gifId));
        const newItems = items.filter(item => !existingGifs.has(item.gifId));

        if (newItems.length > 0) {
            mergedItemsData[catId] = [...mergedItemsData[catId], ...newItems];
        } else {
            console.warn(`Все элементы категории ${catId} уже существуют, пропускаем`);
        }
    }

    return {
        categories: mergedCategories,
        itemsData: mergedItemsData,
        gifs: { ...currentData.gifs, ...newData.gifs }
    };
}

function exportSelectedData(data, selectedCategoryIds, targetDir) {
    try {
        // Фильтруем данные
        const exportData = {
            categories: data.categories.filter(cat => selectedCategoryIds.includes(cat.id)),
            itemsData: {},
            gifs: {}
        };

        // Собираем все GIF ID из выбранных категорий
        const gifIds = new Set();
        selectedCategoryIds.forEach(catId => {
            if (data.itemsData[catId]) {
                exportData.itemsData[catId] = data.itemsData[catId];
                data.itemsData[catId].forEach(item => {
                    gifIds.add(item.gifId);
                });
            }
        });

        // Копируем только нужные GIF файлы
        gifIds.forEach(gifId => {
            const srcPath = getGifPath(gifId);
            if (fs.existsSync(srcPath)) {
                fs.copyFileSync(
                    srcPath,
                    path.join(targetDir, `${gifId}.gif`)
                );
            }
        });

        // Сохраняем данные
        fs.writeFileSync(
            path.join(targetDir, 'data.json'),
            JSON.stringify(exportData, null, 2)
        );

        return true;
    } catch (error) {
        console.error('Error exporting selected data:', error);
        return false;
    }
}

function validateImportedData(data) {
    if (!data) return false;

    // Проверяем базовую структуру
    const isValid =
        Array.isArray(data.categories) &&
        typeof data.itemsData === 'object' &&
        (!data.gifs || typeof data.gifs === 'object');

    if (!isValid) return false;

    // Проверяем каждую категорию
    for (const category of data.categories) {
        if (!category.id || !category.name || !category.key || !category.color) {
            return false;
        }
    }

    // Проверяем itemsData
    for (const [categoryId, items] of Object.entries(data.itemsData)) {
        if (!Array.isArray(items)) return false;
        for (const item of items) {
            if (!item.code || !item.gifId) return false;
        }
    }

    return true;
}
async function importWithFiles(sourceDir) {
    try {
        // 1. Проверяем наличие файла данных
        const dataPath = path.join(sourceDir, 'data.json');
        if (!fs.existsSync(dataPath)) {
            throw new Error('Файл data.json не найден в импортируемом архиве');
        }

        // 2. Читаем и парсим данные
        const rawData = fs.readFileSync(dataPath, 'utf-8');
        const importedData = JSON.parse(rawData);

        // 3. Валидация структуры данных
        if (!validateImportedData(importedData)) {
            throw new Error('Некорректный формат данных в файле data.json');
        }

        // 4. Копируем GIF файлы
        const gifFiles = fs.readdirSync(sourceDir).filter(file => file.endsWith('.gif'));
        for (const file of gifFiles) {
            const gifId = path.basename(file, '.gif');
            const destPath = getGifPath(gifId);
            fs.copyFileSync(path.join(sourceDir, file), destPath);
        }

        return importedData;
    } catch (error) {
        console.error('Error importing with files:', error);
        throw error; // Пробрасываем ошибку дальше
    }
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

function createBackup() {
    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFile = path.join(BACKUP_DIR, `backup_${timestamp}.json`);
        const data = loadData();
        fs.writeFileSync(backupFile, JSON.stringify(data, null, 2));
        return true;
    } catch (error) {
        console.error('Error creating backup:', error);
        return false;
    }
}

function getGifPath(gifId) {
    return path.join(GIFS_DIR, `${gifId}.gif`);
}

function saveGif(gifId, url) {
    return new Promise((resolve) => {
        const gifPath = getGifPath(gifId);
        if (url.startsWith('http')) {
            // Загрузка из интернета
            const axios = require('axios');
            axios.get(url, { responseType: 'arraybuffer' })
                .then(response => {
                    fs.writeFileSync(gifPath, response.data);
                    resolve(true);
                })
                .catch(error => {
                    console.error('Error downloading GIF:', error);
                    resolve(false);
                });
        } else if (url.startsWith('file://')) {
            // Копирование локального файла
            const sourcePath = url.substring(7);
            fs.copyFileSync(sourcePath, gifPath);
            resolve(true);
        } else {
            resolve(false);
        }
    });
}

function deleteGif(gifId) {
    try {
        const gifPath = getGifPath(gifId);
        if (fs.existsSync(gifPath)) {
            fs.unlinkSync(gifPath);
        }
        return true;
    } catch (error) {
        console.error('Error deleting GIF:', error);
        return false;
    }
}

module.exports = {
    saveData,
    loadData,
    createBackup,
    getGifPath,
    saveGif,
    deleteGif,
    exportWithFiles,
    importWithFiles,
    mergeData
};