const { app, BrowserWindow, Tray, Menu, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const dataManager = require('./dataManager');
const GIFS_DIR = path.join(app.getPath('userData'), 'gifs');
const { globalShortcut } = require('electron');

let mainWindow;
let gifWindow = null; // Явно инициализируем как null
let tray;
let currentHotkey = 'CommandOrControl+Shift+G';

function createTray() {
    const iconPath = path.join(__dirname, 'build', 'icon.png');
    if (!fs.existsSync(iconPath)) {
        console.error('Tray icon not found at:', iconPath);
        return;
    }

    tray = new Tray(iconPath);

    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Открыть главное окно',
            click: () => {
                if (mainWindow) mainWindow.show();
            }
        },
        {
            label: 'Открыть GIF панель',
            click: () => {
                openGifPanel();
            }
        },
        { type: 'separator' },
        {
            label: 'Выход',
            click: () => app.quit()
        }
    ]);

    tray.setToolTip('miniGIF');
    tray.setContextMenu(contextMenu);

    tray.on('click', () => {
        if (mainWindow) {
            mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
        }
    });
}

function createMainWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        show: false,
        frame: false, // Полностью отключаем стандартную рамку
        backgroundColor: '#1a1a1a' // Темный фон окна
    });

    mainWindow.webContents.on('dom-ready', () => {
        mainWindow.webContents.executeJavaScript(`
        document.getElementById('minimize-btn').addEventListener('click', () => {
            require('electron').ipcRenderer.send('window-minimize');
        });
        document.getElementById('maximize-btn').addEventListener('click', () => {
            require('electron').ipcRenderer.send('window-maximize');
        });
        document.getElementById('close-btn').addEventListener('click', () => {
            require('electron').ipcRenderer.send('window-close');
        });
    `);
    });


    mainWindow.loadFile('Gifpage.html');
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

function openGifPanel() {
    if (gifWindow && !gifWindow.isDestroyed()) {
        gifWindow.focus();
        return;
    }

    const savedBounds = getSavedWindowBounds();

    gifWindow = new BrowserWindow({
        width: savedBounds.width || 400,
        height: savedBounds.height || 500,
        x: savedBounds.x,
        y: savedBounds.y,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        alwaysOnTop: true,
        frame: false,
        backgroundColor: '#1a1a1a',
        show: false,
        resizable: true,
        minimizable: true,
        titleBarStyle: 'hidden'
    });

    gifWindow.loadFile('GifPanel.html');
    gifWindow.once('ready-to-show', () => {
        gifWindow.show();
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('gif-panel-state-changed', true);
        }
    });

    gifWindow.on('closed', () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('gif-panel-state-changed', false);
        }
        gifWindow = null;

    });

    // Сохраняем размеры и положение при изменении
    gifWindow.on('resize', debounce(saveWindowBounds, 500));
    gifWindow.on('move', debounce(saveWindowBounds, 500));
}


// Функция для сохранения параметров окна
function saveWindowBounds() {
    if (!gifWindow || gifWindow.isDestroyed()) return;

    const bounds = gifWindow.getBounds();
    const data = {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height
    };

    try {
        fs.writeFileSync(
            path.join(app.getPath('userData'), 'gif-panel-bounds.json'),
            JSON.stringify(data)
        );
    } catch (err) {
        console.error('Failed to save window bounds:', err);
    }
}

// Функция для загрузки сохраненных параметров
function getSavedWindowBounds() {
    try {
        const data = fs.readFileSync(
            path.join(app.getPath('userData'), 'gif-panel-bounds.json'),
            'utf-8'
        );
        return JSON.parse(data);
    } catch (err) {
        return {
            width: 400,
            height: 500
        };
    }
}

// Вспомогательная функция для ограничения частоты вызовов
function debounce(func, wait) {
    let timeout;
    return function () {
        const context = this;
        const args = arguments;
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            func.apply(context, args);
        }, wait);
    };
}

function toggleGifPanel() {
    if (gifWindow && !gifWindow.isDestroyed()) {
        gifWindow.close();
    } else {
        openGifPanel();
    }
}

function registerHotkey() {
    globalShortcut.unregisterAll();
    globalShortcut.register(currentHotkey, toggleGifPanel);
}

async function loadHotkey() {
    try {
        const savedHotkey = await fs.promises.readFile(
            path.join(app.getPath('userData'), 'hotkey.json'),
            'utf-8'
        );
        const { hotkey } = JSON.parse(savedHotkey);
        if (hotkey) {
            currentHotkey = hotkey;
            registerHotkey();
        }
    } catch (e) {
        registerHotkey();
    }
}

ipcMain.handle('save-hotkey', async (event, hotkey) => {
    try {
        currentHotkey = hotkey;
        await fs.promises.writeFile(
            path.join(app.getPath('userData'), 'hotkey.json'),
            JSON.stringify({ hotkey })
        );
        registerHotkey();
        return true;
    } catch (e) {
        console.error('Error saving hotkey:', e);
        return false;
    }
});

ipcMain.handle('get-hotkey', async () => {
    return currentHotkey;
});

// Обработчики для GIF-панели
ipcMain.on('panel-minimize', () => {
    if (gifWindow) gifWindow.minimize();
});

ipcMain.on('panel-maximize', () => {
    if (gifWindow) {
        if (gifWindow.isMaximized()) {
            gifWindow.unmaximize();
        } else {
            gifWindow.maximize();
        }
    }
});

ipcMain.on('panel-close', () => {
    if (gifWindow) gifWindow.close();
});

// Отслеживание состояния панели
if (gifWindow) {
    gifWindow.on('maximize', () => {
        gifWindow.webContents.send('panel-state-changed', true);
    });
    gifWindow.on('unmaximize', () => {
        gifWindow.webContents.send('panel-state-changed', false);
    });
}

// Добавьте обработчики IPC основы
ipcMain.on('window-minimize', () => mainWindow.minimize());
ipcMain.on('window-maximize', () => {
    if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
    } else {
        mainWindow.maximize();
    }
});
ipcMain.on('window-close', () => mainWindow.close());

ipcMain.on('toggle-gif-panel', toggleGifPanel);
ipcMain.handle('is-gif-panel-open', () => !!gifWindow);

ipcMain.on('open-gif-panel', () => {
    openGifPanel();
});

ipcMain.on('toggle-always-on-top', (event, { state, level }) => {
    if (gifWindow) {
        // Устанавливаем уровень поверх других окон
        gifWindow.setAlwaysOnTop(state, level);

        // Фикс для Nvidia: принудительно обновляем состояние
        if (state) {
            setTimeout(() => {
                gifWindow.setAlwaysOnTop(false);
                gifWindow.setAlwaysOnTop(true, level);
            }, 50);
        }
    }
});

ipcMain.handle('load-initial-data', async () => {
    return dataManager.loadData();
});

ipcMain.handle('save-data', async (event, data) => {
    const result = await dataManager.saveData(data);
    BrowserWindow.getAllWindows().forEach(win => {
        win.webContents.send('data-updated');
    });
    return result;
});

ipcMain.handle('create-backup', async () => {
    return dataManager.createBackup();
});

ipcMain.handle('get-gif-path', async (event, gifId) => {
    return dataManager.getGifPath(gifId);
});

ipcMain.handle('get-all-gifs', async () => {
    const data = dataManager.loadData();
    return data.gifs || {};
});

ipcMain.handle('save-gif', async (event, { gifId, url }) => {
    return dataManager.saveGif(gifId, url);
});

ipcMain.handle('delete-gif', async (event, gifId) => {
    return dataManager.deleteGif(gifId);
});

ipcMain.handle('copy-gif-file', async (event, { fromGifId, toGifId }) => {
    try {
        const fromPath = path.join(app.getPath('userData'), 'gifs', `${fromGifId}.gif`);
        const toPath = path.join(app.getPath('userData'), 'gifs', `${toGifId}.gif`);
        if (fs.existsSync(fromPath)) {
            fs.copyFileSync(fromPath, toPath);
            return true;
        }
        return false;
    } catch (error) {
        console.error('Error copying GIF file:', error);
        return false;
    }
});

ipcMain.handle('export-data', async (event, exportData) => {
    // Теперь просто возвращаем подготовленные данные
    return {
        data: exportData,
        gifCount: Object.values(exportData.itemsData).reduce((acc, items) => acc + items.length, 0)
    };
});

ipcMain.handle('save-export-file', async (event, { exportData, filePath }) => {
    try {
        const GIFS_DIR = path.join(app.getPath('userData'), 'gifs'); // Добавляем определение
        const tempDir = path.join(app.getPath('temp'), `gif_export_${Date.now()}`);

        // Создаем временную директорию
        fs.mkdirSync(tempDir, { recursive: true });

        // 1. Собираем все GIF ID из выбранных категорий
        const gifsToExport = new Set();
        for (const catId in exportData.itemsData) {
            exportData.itemsData[catId].forEach(item => {
                if (item.gifId) { // Добавляем проверку на существование gifId
                    gifsToExport.add(item.gifId);
                }
            });
        }

        // 2. Копируем только нужные GIF файлы
        if (fs.existsSync(GIFS_DIR)) { // Проверяем существование директории
            const allGifs = fs.readdirSync(GIFS_DIR);
            allGifs.forEach(file => {
                if (file.endsWith('.gif')) {
                    const gifId = file.replace('.gif', '');
                    if (gifsToExport.has(gifId)) {
                        fs.copyFileSync(
                            path.join(GIFS_DIR, file),
                            path.join(tempDir, file)
                        );
                    }
                }
            });
        }

        // 3. Сохраняем данные
        fs.writeFileSync(
            path.join(tempDir, 'data.json'),
            JSON.stringify(exportData, null, 2)
        );

        // 4. Архивируем
        const archiver = require('archiver');
        const output = fs.createWriteStream(filePath);
        const archive = archiver('zip', { zlib: { level: 9 } });

        return new Promise((resolve) => {
            output.on('close', () => {
                // Удаляем временную директорию после архивации
                fs.rmSync(tempDir, { recursive: true });
                resolve(true);
            });

            archive.on('error', (err) => {
                console.error('Archive error:', err);
                resolve(false);
            });

            archive.pipe(output);
            archive.directory(tempDir, false);
            archive.finalize();
        });
    } catch (err) {
        console.error('Export error:', err);
        return false;
    }
});

ipcMain.handle('show-save-dialog', async (event, options) => {
    return await dialog.showSaveDialog({
        ...options,
        defaultPath: path.join(app.getPath('desktop'), options.defaultPath)
    });
});

ipcMain.handle('import-data', async () => {
    let tempDir;
    try {
        const { filePaths } = await dialog.showOpenDialog({
            title: 'Импорт данных',
            properties: ['openFile'],
            filters: [
                { name: 'ZIP Archive', extensions: ['zip'] },
                { name: 'JSON File', extensions: ['json'] }
            ]
        });

        if (!filePaths || filePaths.length === 0) return null;

        tempDir = path.join(app.getPath('temp'), `gif_import_${Date.now()}`);
        fs.mkdirSync(tempDir, { recursive: true });

        if (filePaths[0].endsWith('.zip')) {
            const extract = require('extract-zip');
            await extract(filePaths[0], { dir: tempDir });
        } else {
            fs.copyFileSync(filePaths[0], path.join(tempDir, 'data.json'));
        }

        const importedData = await dataManager.importWithFiles(tempDir);
        if (!importedData) throw new Error('Не удалось загрузить данные');

        const { response } = await dialog.showMessageBox({
            type: 'question',
            buttons: ['Объединить', 'Заменить', 'Отмена'],
            title: 'Стратегия импорта',
            message: 'Как импортировать данные?',
            detail: 'Объединить: добавит новые данные к существующим\nЗаменить: удалит текущие данные и заменит их импортированными'
        });

        if (response === 2) return null;

        let mergedData;
        if (response === 0) {
            mergedData = dataManager.mergeData(importedData);
        } else {
            mergedData = importedData;
        }

        // Сохраняем данные
        await dataManager.saveData(mergedData);

        // Отправляем событие об обновлении данных во все окна
        BrowserWindow.getAllWindows().forEach(win => {
            win.webContents.send('data-updated', mergedData);
        });

        return mergedData;
    } catch (err) {
        console.error('Import error:', err);
        dialog.showErrorBox('Ошибка импорта', err.message);
        return null;
    } finally {
        if (tempDir && fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true });
        }
    }
});

ipcMain.handle('save-categories-order', async (event, order) => {
    await fs.promises.writeFile(
        path.join(app.getPath('userData'), 'categories-order.json'),
        JSON.stringify(order)
    );
});

ipcMain.handle('load-categories-order', async () => {
    try {
        const data = await fs.promises.readFile(
            path.join(app.getPath('userData'), 'categories-order.json'),
            'utf-8'
        );
        return JSON.parse(data);
    } catch (e) {
        return null;
    }
});
ipcMain.on('restart-app', () => {
    app.relaunch();
    app.exit(0);
});

function createApplicationMenu() {
    const template = [
        {
            label: 'Файл',
            submenu: [
                {
                    label: 'Экспорт данных',
                    click: () => mainWindow.webContents.send('trigger-export')
                },
                {
                    label: 'Импорт данных',
                    click: () => mainWindow.webContents.send('trigger-import')
                },
                { type: 'separator' },
                { role: 'quit' }
            ]
        },
        { role: 'editMenu' },
        { role: 'viewMenu' }
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
    createApplicationMenu();
    createMainWindow();
    createTray();
    loadHotkey();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
    }
});

app.on('before-quit', (event) => {
    // Сохраняем параметры окна перед закрытием
    if (gifWindow && !gifWindow.isDestroyed()) {
        saveWindowBounds();
        event.preventDefault();
        gifWindow.once('closed', () => {
            gifWindow = null;
            app.quit();
        });
        gifWindow.close();
    }
});