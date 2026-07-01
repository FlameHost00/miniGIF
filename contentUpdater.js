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
        console.log('📥 Начинаем обновление контента...');
        const newContent = contentUpdateData.content;
        const userData = dataManager.loadData();
        
        const systemCategory = userData.categories.find(c => c.id === 'system_gifs');
        if (!systemCategory) {
            throw new Error('Системная категория не найдена');
        }
        
        const newSystemItems = newContent.systemGifs || [];
        const currentSystemItems = userData.itemsData['system_gifs'] || [];
        const existingCodes = new Set(currentSystemItems.map(item => item.code));
        const newItems = newSystemItems.filter(item => !existingCodes.has(item.code));
        
        console.log(`📦 Новых элементов: ${newItems.length}`);
        
        // Отправляем начальное состояние прогресса
        sendProgressUpdate(0, newItems.length, 'Подготовка к загрузке...', '');
        
        let downloadedCount = 0;
        let totalCount = newItems.length;
        
        for (let i = 0; i < newItems.length; i++) {
            const newItem = newItems[i];
            const gifId = newItem.gifId;
            
            // Отправляем прогресс
            const progress = Math.round(((i) / totalCount) * 100);
            sendProgressUpdate(progress, totalCount, `Загрузка: ${newItem.code}`, newItem.code);
            
            const gifUrl = `https://raw.githubusercontent.com/FlameHost00/miniGIF/master/gifs/${gifId}.gif`;
            console.log(`📥 Скачивание (${i+1}/${totalCount}): ${gifUrl}`);
            
            const success = await dataManager.saveGif(gifId, gifUrl);
            if (success) {
                downloadedCount++;
                console.log(`✅ Скачан: ${newItem.code}`);
            } else {
                console.log(`❌ Ошибка скачивания: ${newItem.code}`);
            }
            
            currentSystemItems.push({
                code: newItem.code,
                gifId: gifId
            });
        }
        
        // Отправляем финальный прогресс
        sendProgressUpdate(100, totalCount, 'Загрузка завершена! ✅', '');
        
        userData.itemsData['system_gifs'] = currentSystemItems;
        dataManager.saveData(userData);
        
        console.log(`✅ Обновление завершено! Скачано: ${downloadedCount}/${totalCount}`);
        return true;
    } catch (error) {
        console.error('❌ Error applying content update:', error);
        sendProgressUpdate(-1, 0, 'Ошибка загрузки', '');
        return false;
    }
}

// Функция для отправки прогресса в UI
function sendProgressUpdate(percent, total, status, currentGif) {
    const windows = require('electron').BrowserWindow.getAllWindows();
    windows.forEach(win => {
        win.webContents.send('content-update-progress', {
            percent: percent,
            total: total,
            status: status,
            currentGif: currentGif
        });
    });
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