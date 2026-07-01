// contentUpdater.js
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const dataManager = require('./dataManager');

const CONTENT_VERSION_FILE = path.join(app.getPath('userData'), 'content_version.json');
const GITHUB_API_URL = 'https://api.github.com/repos/FlameHost00/miniGIF/contents/gifs_content.json';
const GITHUB_RAW_URL = 'https://raw.githubusercontent.com/FlameHost00/miniGIF/master/gifs_content.json';

let contentUpdateData = null;

// Функция для проверки обновлений контента
async function checkContentUpdates() {
    try {
        // Загружаем текущую версию
        const currentVersion = getCurrentContentVersion();
        
        // Получаем информацию о файле из GitHub API
        const response = await axios.get(GITHUB_API_URL, {
            headers: {
                'Accept': 'application/vnd.github.v3+json'
            }
        });
        
        const githubData = response.data;
        const remoteSha = githubData.sha;
        const remoteVersion = JSON.parse(Buffer.from(githubData.content, 'base64').toString()).version;
        
        // Сравниваем версии
        if (currentVersion.version !== remoteVersion) {
            // Есть обновление!
            contentUpdateData = {
                version: remoteVersion,
                sha: remoteSha,
                url: githubData.download_url,
                content: JSON.parse(Buffer.from(githubData.content, 'base64').toString())
            };
            return true;
        }
        
        return false;
    } catch (error) {
        console.error('Error checking content updates:', error);
        return false;
    }
}

// Функция для загрузки и применения обновления
async function applyContentUpdate() {
    if (!contentUpdateData) return false;
    
    try {
        const newContent = contentUpdateData.content;
        
        // Сохраняем текущие данные пользователя
        const userData = dataManager.loadData();
        
        // Получаем системную категорию
        const systemCategory = userData.categories.find(c => c.id === 'system_gifs');
        if (!systemCategory) {
            throw new Error('Системная категория не найдена');
        }
        
        // Обновляем элементы в системной категории
        const newSystemItems = newContent.systemGifs || [];
        const currentSystemItems = userData.itemsData['system_gifs'] || [];
        
        // Находим новые элементы (которых еще нет)
        const existingCodes = new Set(currentSystemItems.map(item => item.code));
        const newItems = newSystemItems.filter(item => !existingCodes.has(item.code));
        
        // Добавляем новые элементы
        for (const newItem of newItems) {
            const gifId = `gif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            
            // Загружаем GIF из репозитория
            const gifUrl = `https://raw.githubusercontent.com/FlameHost00/miniGIF/main/gifs/${newItem.gifId}.gif`;
            await dataManager.saveGif(gifId, gifUrl);
            
            currentSystemItems.push({
                code: newItem.code,
                gifId: gifId
            });
        }
        
        // Сохраняем обновленные данные
        userData.itemsData['system_gifs'] = currentSystemItems;
        dataManager.saveData(userData);
        
        // Сохраняем новую версию
        saveCurrentContentVersion(contentUpdateData.version, contentUpdateData.sha);
        
        // Отправляем уведомление
        if (newItems.length > 0) {
            // Показываем уведомление о новых GIF
            const mainWindow = require('electron').BrowserWindow.getAllWindows()[0];
            if (mainWindow) {
                mainWindow.webContents.send('new-system-gifs', {
                    count: newItems.length,
                    items: newItems
                });
            }
        }
        
        return true;
    } catch (error) {
        console.error('Error applying content update:', error);
        return false;
    }
}

// Функция для получения текущей версии контента
function getCurrentContentVersion() {
    try {
        if (fs.existsSync(CONTENT_VERSION_FILE)) {
            const data = JSON.parse(fs.readFileSync(CONTENT_VERSION_FILE, 'utf-8'));
            return data;
        }
    } catch (error) {
        console.error('Error reading content version:', error);
    }
    return { version: '0.0.0', sha: '' };
}

// Функция для сохранения версии контента
function saveCurrentContentVersion(version, sha) {
    try {
        fs.writeFileSync(CONTENT_VERSION_FILE, JSON.stringify({ version, sha, updatedAt: new Date().toISOString() }));
    } catch (error) {
        console.error('Error saving content version:', error);
    }
}

// Функция для создания файла с контентом для GitHub
function generateContentFile() {
    const data = dataManager.loadData();
    const systemItems = data.itemsData['system_gifs'] || [];
    
    const content = {
        version: '1.0.0', // Увеличивайте при каждом обновлении
        systemGifs: systemItems.map(item => ({
            code: item.code,
            gifId: item.gifId
        }))
    };
    
    return content;
}

module.exports = {
    checkContentUpdates,
    applyContentUpdate,
    getCurrentContentVersion,
    generateContentFile
};