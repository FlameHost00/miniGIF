const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const notifications = require('./notifications');

const CACHE_DIR = path.join(app.getPath('userData'), 'gif_cache');

if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
}

async function updateGif(url, cacheKey) {
    try {
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        const filePath = path.join(CACHE_DIR, `${cacheKey}.gif`);
        fs.writeFileSync(filePath, response.data);
        return filePath;
    } catch (error) {
        console.error('Error updating GIF:', error);
        return null;
    }
}

async function checkAndUpdateGifs(gifUrls) {
    const results = {};
    
    for (const [key, url] of Object.entries(gifUrls)) {
        try {
            const response = await axios.head(url);
            if (response.status === 200) {
                const filePath = await updateGif(url, key);
                if (filePath) {
                    results[key] = filePath;
                }
            }
        } catch (error) {
            console.error(`Error checking GIF ${url}:`, error);
        }
    }
    
    if (Object.keys(results).length > 0) {
        notifications.showNotification(
            'GIF обновлены',
            `Успешно обновлено ${Object.keys(results).length} GIF-изображений`
        );
    }
    
    return results;
}

module.exports = {
    checkAndUpdateGifs,
    getGifPath: (cacheKey) => path.join(CACHE_DIR, `${cacheKey}.gif`)
};