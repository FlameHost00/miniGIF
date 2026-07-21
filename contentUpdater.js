// contentUpdater.js
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const dataManager = require('./dataManager');

const CONTENT_VERSION_FILE = path.join(app.getPath('userData'), 'content_version.json');
const GITHUB_RAW_URL = 'https://raw.githubusercontent.com/FlameHost00/miniGIF/master/gifs_content.json';

let contentUpdateData = null;
let newGifsList = [];

async function checkContentUpdates() {
    try {
        console.log('🔍 Проверка обновлений контента (сравнение по кодам)...');
        
        const response = await axios.get(GITHUB_RAW_URL, {
            headers: {
                'User-Agent': 'miniGIF-App',
                'Cache-Control': 'no-cache'
            },
            params: {
                _t: Date.now()
            },
            timeout: 10000
        });
        
        const remoteContent = response.data;
        const remoteVersion = remoteContent.version || '1.0.0';
        const remoteSystemGifs = remoteContent.systemGifs || [];
        
        console.log(`📌 Версия на GitHub: ${remoteVersion}`);
        console.log(`📌 Всего GIF на GitHub: ${remoteSystemGifs.length}`);
        
        const userData = dataManager.loadData();
        const currentSystemItems = userData.itemsData['system_gifs'] || [];
        console.log(`📌 Локальных GIF: ${currentSystemItems.length}`);
        
        const existingCodes = new Set(currentSystemItems.map(item => item.code));
        const newItems = remoteSystemGifs.filter(item => !existingCodes.has(item.code));
        
        console.log(`📦 Найдено НОВЫХ элементов: ${newItems.length}`);
        
        if (newItems.length > 0) {
            newGifsList = newItems.map(item => ({
                code: item.code,
                gifId: item.gifId,
                gifUrl: `https://raw.githubusercontent.com/FlameHost00/miniGIF/master/gifs/${item.gifId}.gif`
            }));
            
            contentUpdateData = {
                version: remoteVersion,
                content: remoteContent,
                newGifs: newItems,
                newGifsCount: newItems.length
            };
            
            saveCurrentContentVersion(remoteVersion, response.headers.etag || '');
            
            console.log(`✅ Обновление доступно! Новых GIF: ${newItems.length}`);
            return true;
        }
        
        console.log('ℹ️ Нет новых GIF');
        return false;
    } catch (error) {
        console.error('❌ Ошибка проверки:', error.message);
        return false;
    }
}

async function applyContentUpdate() {
    if (!contentUpdateData) {
        console.error('❌ Нет данных об обновлении');
        return false;
    }
    
    try {
        console.log('📥 Начинаем загрузку новых GIF...');
        const newItems = contentUpdateData.newGifs || [];
        const totalCount = newItems.length;
        
        console.log(`📊 Всего новых GIF для загрузки: ${totalCount}`);
        
        if (totalCount === 0) {
            console.log('ℹ️ Нет новых GIF для загрузки');
            return true;
        }
        
        const userData = dataManager.loadData();
        const currentSystemItems = userData.itemsData['system_gifs'] || [];
        
        sendProgressUpdate(0, totalCount, 'Подготовка к загрузке...', '');
        
        let downloadedCount = 0;
        let failedCount = 0;
        
        for (let i = 0; i < totalCount; i++) {
            const newItem = newItems[i];
            const gifId = newItem.gifId;
            
            const percent = Math.round(((i + 1) / totalCount) * 100);
            sendProgressUpdate(percent, totalCount, `Загрузка: ${newItem.code} (${i+1}/${totalCount})`, newItem.code);
            
            const gifUrl = `https://raw.githubusercontent.com/FlameHost00/miniGIF/master/gifs/${gifId}.gif`;
            console.log(`📥 Скачивание (${i+1}/${totalCount}): ${newItem.code}`);
            
            const success = await dataManager.saveGif(gifId, gifUrl);
            if (success) {
                downloadedCount++;
                console.log(`✅ Скачан: ${newItem.code}`);
            } else {
                failedCount++;
                console.log(`❌ Ошибка: ${newItem.code}`);
            }
            
            currentSystemItems.push({
                code: newItem.code,
                gifId: gifId
            });
        }
        
        sendProgressUpdate(100, totalCount, 'Загрузка завершена! ✅', '');
        
        userData.itemsData['system_gifs'] = currentSystemItems;
        dataManager.saveData(userData);
        
        console.log(`✅ Загружено: ${downloadedCount}/${totalCount}, Ошибок: ${failedCount}`);
        return true;
    } catch (error) {
        console.error('❌ Ошибка загрузки:', error.message);
        sendProgressUpdate(-1, 0, 'Ошибка загрузки', '');
        return false;
    }
}

function getNewGifsList() {
    return newGifsList;
}

function sendProgressUpdate(percent, total, status, currentGif) {
    console.log(`📊 Прогресс: ${percent}%, ${total} всего`);
    
    try {
        const windows = require('electron').BrowserWindow.getAllWindows();
        windows.forEach(win => {
            try {
                win.webContents.send('content-update-progress', {
                    percent: percent,
                    total: total,
                    status: status,
                    currentGif: currentGif || ''
                });
            } catch (e) {}
        });
    } catch (error) {
        console.error('Ошибка отправки прогресса:', error.message);
    }
}

function getCurrentContentVersion() {
    try {
        if (fs.existsSync(CONTENT_VERSION_FILE)) {
            const data = JSON.parse(fs.readFileSync(CONTENT_VERSION_FILE, 'utf-8'));
            return { version: data.version || '0.0.0', sha: data.sha || '' };
        }
    } catch (error) {
        console.error('Ошибка чтения версии:', error.message);
    }
    return { version: '0.0.0', sha: '' };
}

function saveCurrentContentVersion(version, sha) {
    try {
        const data = {
            version: version || '1.0.0',
            sha: sha || '',
            updatedAt: new Date().toISOString()
        };
        fs.writeFileSync(CONTENT_VERSION_FILE, JSON.stringify(data, null, 2));
        console.log(`💾 Версия сохранена: ${version}`);
    } catch (error) {
        console.error('Ошибка сохранения версии:', error.message);
    }
}

function generateContentFile() {
    try {
        const data = dataManager.loadData();
        const systemItems = data.itemsData['system_gifs'] || [];
        
        const content = {
            version: '2.0.0',
            systemGifs: systemItems.map(item => ({
                code: item.code,
                gifId: item.gifId
            }))
        };
        
        console.log(`📄 Сгенерирован файл: ${content.systemGifs.length} GIF`);
        return content;
    } catch (error) {
        console.error('Ошибка генерации:', error.message);
        return null;
    }
}

module.exports = {
    checkContentUpdates,
    applyContentUpdate,
    getCurrentContentVersion,
    generateContentFile,
    getNewGifsList
};