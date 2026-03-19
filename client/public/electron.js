const { app, BrowserWindow, ipcMain, clipboard, Tray, Menu, nativeImage, screen, desktopCapturer, globalShortcut, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const isDev = require('electron-is-dev');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');
const axios = require('axios');

autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';

let pendingDeepLink = null;
let mainWindow;
let updaterWindow;
let tray = null;
let isQuitting = false;
let currentVoiceState = { isMuted: false, isDeafened: false, isConnected: false };
const isOpenedHidden = process.argv.includes('--hidden') || app.getLoginItemSettings().wasOpenedAsHidden;

let appSettings = {
    minimizeToTray: true,
    closeToTray: true,
    startMinimized: false
};

// --- IPC Handlers (Registered early to prevent renderer errors) ---
ipcMain.handle('get-app-version', () => app.getVersion());

ipcMain.handle('get-pending-deep-link', () => {
    const link = pendingDeepLink;
    pendingDeepLink = null;
    return link;
});

ipcMain.handle('toggle-autostart', (event, enable) => {
    try {
        app.setLoginItemSettings({
            openAtLogin: enable,
            path: app.getPath('exe'),
            args: ['--hidden']
        });
        return app.getLoginItemSettings().openAtLogin;
    } catch (e) {
        return false;
    }
});

ipcMain.handle('get-autostart-status', () => app.getLoginItemSettings().openAtLogin);

ipcMain.on('update-window-settings', (event, settings) => {
    appSettings = { ...appSettings, ...settings };
});

ipcMain.on('restart-app', () => {
    app.relaunch();
    app.exit();
});
// -------------------------------------------------------------

// Performance Tuning
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('use-fake-ui-for-media-stream');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-oop-rasterization');
app.commandLine.appendSwitch('enable-accelerated-video-decode');
app.commandLine.appendSwitch('enable-zero-copy'); // Reduces memory copy for video/audio
app.commandLine.appendSwitch('ignore-gpu-blocklist'); // Ensure GPU is used even on older drivers
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=4096 --stack-size=2048');

if (!isDev) {
    app.commandLine.appendSwitch('force-device-scale-factor', '1'); // Consistent sizing
}

// Disable the yellow/green border on Windows 10/11 when capturing windows
// Also disable Vulkan which can cause green screen/flickering on some GPUs
app.commandLine.appendSwitch('disable-features', 'WinrtCaptureBorders,Vulkan');

const stateFilePath = path.join(app.getPath('userData'), 'window-state.json');

function loadWindowState() {
    try {
        if (fs.existsSync(stateFilePath)) {
            const data = fs.readFileSync(stateFilePath, 'utf8');
            return JSON.parse(data);
        }
    } catch (e) { }
    return { width: 1280, height: 800 };
}

function saveWindowState() {
    if (!mainWindow) return;
    try {
        const bounds = mainWindow.getBounds();
        const state = { ...bounds, isMaximized: mainWindow.isMaximized() };
        fs.writeFileSync(stateFilePath, JSON.stringify(state));
    } catch (e) { }
}

autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.setFeedURL({ provider: 'github', owner: 'yakushinvl', repo: 'maxcord' });

if (process.defaultApp) {
    if (process.argv.length >= 2) app.setAsDefaultProtocolClient('maxcord', process.execPath, [path.resolve(process.argv[1])]);
} else app.setAsDefaultProtocolClient('maxcord');

const startupUrl = process.argv.find(arg => arg.startsWith('maxcord://'));
if (startupUrl) pendingDeepLink = startupUrl;

if (!app.requestSingleInstanceLock()) {
    app.quit();
} else {
    app.on('second-instance', (event, commandLine) => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
            const url = commandLine.find(arg => arg.startsWith('maxcord://'));
            if (url) mainWindow.webContents.send('deep-link', url);
        }
    });

    app.whenReady().then(() => {
        if (!tray) createTray();
        if (isDev) createWindow();
        else createUpdaterWindow();
    });
}

function createTray() {
    const iconPath = path.join(__dirname, 'app_icon.ico');
    const trayIcon = nativeImage.createFromPath(iconPath);
    tray = new Tray(trayIcon);
    updateTrayMenu();
    tray.setToolTip('maxcord');
    tray.on('click', () => {
        if (mainWindow) {
            if (mainWindow.isVisible()) {
                if (mainWindow.isFocused()) mainWindow.hide();
                else { mainWindow.show(); mainWindow.focus(); }
            } else { mainWindow.show(); mainWindow.focus(); }
        }
    });
}

function updateTrayMenu() {
    if (!tray) return;
    const contextMenu = Menu.buildFromTemplate([
        { label: 'Открыть maxcord', click: () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } } },
        { type: 'separator' },
        {
            label: currentVoiceState.isMuted ? '✓ Микрофон выключен' : 'Выключить микрофон',
            enabled: currentVoiceState.isConnected,
            click: () => { if (mainWindow) mainWindow.webContents.send('toggle-mute-shortcut'); }
        },
        {
            label: currentVoiceState.isDeafened ? '✓ Звук выключен' : 'Выключить звук',
            enabled: currentVoiceState.isConnected,
            click: () => { if (mainWindow) mainWindow.webContents.send('toggle-deafen-shortcut'); }
        },
        { type: 'separator' },
        { label: 'Выйти', click: () => { isQuitting = true; app.quit(); } }
    ]);
    tray.setContextMenu(contextMenu);
}

function updateTrayStatus(state) {
    if (!tray) return;
    currentVoiceState = state;
    const { isMuted, isDeafened, isConnected } = state;
    let iconName = 'app_icon.ico';
    let statusText = 'maxcord - В сети';

    if (isDeafened) {
        iconName = 'icon_deafened.ico';
        statusText = 'maxcord - Звук выключен';
    } else if (isMuted) {
        iconName = 'icon_muted.ico';
        statusText = 'maxcord - Микрофон выключен';
    } else if (!isConnected) {
        statusText = 'maxcord - Не в голосе';
    }

    const iconPath = path.join(__dirname, iconName);
    if (fs.existsSync(iconPath)) {
        tray.setImage(nativeImage.createFromPath(iconPath));
    }
    tray.setToolTip(statusText);
    updateTrayMenu();
}

function registerGlobalShortcuts() {
    // Toggle Mute: Ctrl+Shift+M
    globalShortcut.register('CommandOrControl+Shift+M', () => {
        if (mainWindow) mainWindow.webContents.send('toggle-mute-shortcut');
    });

    // Toggle Deafen: Ctrl+Shift+D
    globalShortcut.register('CommandOrControl+Shift+D', () => {
        if (mainWindow) mainWindow.webContents.send('toggle-deafen-shortcut');
    });
}

function unregisterGlobalShortcuts() {
    globalShortcut.unregisterAll();
}

function createUpdaterWindow() {
    updaterWindow = new BrowserWindow({ width: 400, height: 500, frame: false, backgroundColor: '#1e1f22', show: false, webPreferences: { nodeIntegration: true, contextIsolation: false } });
    updaterWindow.loadFile(path.join(__dirname, 'updater.html'));
    updaterWindow.once('ready-to-show', () => {
        if (!isOpenedHidden) updaterWindow.show();
        if (!isDev) {
            autoUpdater.checkForUpdates();
            const safetyTimeout = setTimeout(() => { createWindow(); if (updaterWindow && !updaterWindow.isDestroyed()) updaterWindow.close(); }, 10000);
            autoUpdater.on('update-available', () => clearTimeout(safetyTimeout));
            autoUpdater.on('update-not-available', () => clearTimeout(safetyTimeout));
            autoUpdater.on('error', () => clearTimeout(safetyTimeout));
        } else setTimeout(() => { createWindow(); updaterWindow.close(); }, 2000);
    });
    autoUpdater.on('checking-for-update', () => updaterWindow.webContents.send('updater-message', 'Проверка обновлений...'));
    autoUpdater.on('update-available', (info) => updaterWindow.webContents.send('updater-message', `Найдено обновление ${info.version}. Загрузка...`));
    autoUpdater.on('update-not-available', () => {
        updaterWindow.webContents.send('updater-message', 'У вас последняя версия');
        setTimeout(() => { createWindow(); if (updaterWindow && !updaterWindow.isDestroyed()) updaterWindow.close(); }, 1000);
    });
    autoUpdater.on('error', () => {
        updaterWindow.webContents.send('updater-message', 'Ошибка при поиске обновлений');
        setTimeout(() => { createWindow(); if (updaterWindow && !updaterWindow.isDestroyed()) updaterWindow.close(); }, 2000);
    });
    autoUpdater.on('download-progress', (progressObj) => updaterWindow.webContents.send('updater-progress', progressObj.percent));
    autoUpdater.on('update-downloaded', () => {
        updaterWindow.webContents.send('updater-message', 'Обновление скачано. Установка...');
        setTimeout(() => autoUpdater.quitAndInstall(), 1000);
    });
}

function createWindow() {
    const windowState = loadWindowState();
    const display = screen.getPrimaryDisplay();
    const workArea = display.workArea;
    let { width, height, x, y } = windowState;
    if (!width || width < 800) width = 1280;
    if (!height || height < 600) height = 800;
    if (x === undefined || y === undefined || x < workArea.x || x > workArea.x + workArea.width || y < workArea.y || y > workArea.y + workArea.height) {
        x = workArea.x + (workArea.width - width) / 2;
        y = workArea.y + (workArea.height - height) / 2;
    } else if (!windowState.isMaximized) {
        if (width > workArea.width) width = workArea.width;
        if (height > workArea.height) height = workArea.height;
        if (y + height > workArea.y + workArea.height) y = workArea.y + workArea.height - height;
    }
    mainWindow = new BrowserWindow({
        width, height, x, y, minWidth: 800, minHeight: 600,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            enableRemoteModule: false,
            webSecurity: true,
            backgroundThrottling: false,
            spellcheck: false, // Performance: Disable spellcheck
            v8CacheOptions: 'bypass-heat-check-and-allow-code-cache', // Faster JIT
            preload: isDev ? path.join(__dirname, '../public/preload.js') : path.join(__dirname, 'preload.js')
        },
        autoHideMenuBar: true,
        frame: false,
        backgroundColor: '#1e1f22',
        icon: path.join(__dirname, 'app_icon.ico'),
        show: false // Performance: Use ready-to-show to prevent white flash
    });
    mainWindow.once('ready-to-show', () => {
        if (!appSettings.startMinimized && !isOpenedHidden) {
            mainWindow.show();
        }
        scanActivities();
    });

    // Handle Permissions (Essential for packaged apps)
    mainWindow.webContents.session.setPermissionCheckHandler((webContents, permission, requestingOrigin) => {
        if (permission === 'media' || permission === 'display-capture') return true;
        return false;
    });

    mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
        if (permission === 'media' || permission === 'display-capture') {
            callback(true);
        } else {
            callback(false);
        }
    });
    let saveTimeout;
    const debouncedSave = () => { clearTimeout(saveTimeout); saveTimeout = setTimeout(saveWindowState, 500); };
    mainWindow.on('resize', debouncedSave);
    mainWindow.on('move', debouncedSave);
    mainWindow.on('minimize', (event) => {
        if (appSettings.minimizeToTray) {
            event.preventDefault();
            mainWindow.hide();
        }
    });
    mainWindow.on('close', (event) => {
        if (!isQuitting && appSettings.closeToTray) {
            event.preventDefault();
            saveWindowState();
            mainWindow.hide();
            return false;
        }
        saveWindowState();
    });
    if (!tray) createTray();
    registerGlobalShortcuts();

    app.on('will-quit', () => {
        unregisterGlobalShortcuts();
    });
    app.on('open-url', (event, url) => {
        event.preventDefault();
        if (mainWindow) mainWindow.webContents.send('deep-link', url);
        else pendingDeepLink = url;
    });
    mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
        const allowed = ['media', 'microphone', 'camera'];
        callback(allowed.includes(permission));
    });
    mainWindow.webContents.session.setPermissionCheckHandler((webContents, permission) => {
        const allowed = ['media', 'microphone', 'camera'];
        return allowed.includes(permission);
    });

    mainWindow.webContents.on('context-menu', (event, params) => {
        const template = [];
        if (params.isEditable) {
            template.push({ role: 'undo', label: 'Отменить' });
            template.push({ role: 'redo', label: 'Повторить' });
            template.push({ type: 'separator' });
            template.push({ role: 'cut', label: 'Вырезать' });
        }
        if (params.selectionText.trim().length > 0 || params.isEditable) {
            template.push({ role: 'copy', label: 'Копировать' });
        }
        if (params.isEditable) {
            template.push({ role: 'paste', label: 'Вставить' });
            template.push({ role: 'selectAll', label: 'Выбрать все' });
        }
        if (template.length > 0) {
            const menu = Menu.buildFromTemplate(template);
            menu.popup({ window: mainWindow });
        }
    });

    mainWindow.webContents.on('did-finish-load', () => {
        if (pendingDeepLink) mainWindow.webContents.send('deep-link', pendingDeepLink);
    });
    mainWindow.on('enter-full-screen', () => mainWindow.webContents.send('fullscreen-changed', true));
    mainWindow.on('leave-full-screen', () => mainWindow.webContents.send('fullscreen-changed', false));
    mainWindow.loadURL(isDev ? 'http://localhost:3000' : `file://${path.join(__dirname, 'index.html')}`);
    mainWindow.on('maximize', () => mainWindow.webContents.send('window-maximized', true));
    mainWindow.on('unmaximize', () => mainWindow.webContents.send('window-maximized', false));

    // Disable backward/forward navigation using mouse side buttons (App commands)
    mainWindow.on('app-command', (e, cmd) => {
        if (cmd === 'browser-backward' || cmd === 'browser-forward') {
            e.preventDefault();
        }
    });

    if (isDev) mainWindow.webContents.openDevTools();
}

ipcMain.on('voice-state-sync', (event, state) => {
    updateTrayStatus(state);
});

ipcMain.on('show-native-notification', (event, { title, body, silent }) => {
    if (Notification.isSupported()) {
        const notification = new Notification({
            title,
            body,
            silent,
            icon: path.join(__dirname, 'icon.png')
        });
        notification.show();
        notification.on('click', () => {
            if (mainWindow) {
                mainWindow.show();
                mainWindow.focus();
            }
        });
    }
});

ipcMain.on('clipboard-write', (event, text) => {
    try { clipboard.writeText(text); } catch (error) { }
});

const { exec } = require('child_process');
let lastActivity = null;
let activityStartTime = null;
let scanInProgress = false;
let currentScanTimeout = null;
let adaptiveInterval = 3000;

// API Keys and Cache
// USER: Replace with your actual SteamGridDB API Key
const STEAMGRID_API_KEY = '84d5caff741db867dcb433b3e3a7fd37';
const gameMetadataCache = new Map();

const KNOWN_GAMES = {
    'VALORANT-Win64-Shipping.exe': { name: 'VALORANT', icon: 'https://static-cdn.jtvnw.net/ttv-boxart/516575_IGDB-285x380.jpg', type: 'game' },
    'VALORANT.exe': { name: 'VALORANT', icon: 'https://static-cdn.jtvnw.net/ttv-boxart/516575_IGDB-285x380.jpg', type: 'game' },
    'cs2.exe': { name: 'Counter-Strike 2', icon: 'https://static-cdn.jtvnw.net/ttv-boxart/32399_IGDB-285x380.jpg', type: 'game' },
    'csgo.exe': { name: 'Counter-Strike: GO', icon: 'https://static-cdn.jtvnw.net/ttv-boxart/32399_IGDB-285x380.jpg', type: 'game' },
    'dota2.exe': { name: 'Dota 2', icon: 'https://static-cdn.jtvnw.net/ttv-boxart/29595_IGDB-285x380.jpg', type: 'game' },
    'League of Legends.exe': { name: 'League of Legends', icon: 'https://static-cdn.jtvnw.net/ttv-boxart/21779_IGDB-285x380.jpg', type: 'game' },
    'Minecraft.exe': { name: 'Minecraft', icon: 'https://static-cdn.jtvnw.net/ttv-boxart/27471_IGDB-285x380.jpg', type: 'game' },
    'javaw.exe': { name: 'Minecraft', icon: 'https://static-cdn.jtvnw.net/ttv-boxart/27471_IGDB-285x380.jpg', type: 'game' },
    'RobloxPlayerBeta.exe': { name: 'Roblox', icon: 'https://static-cdn.jtvnw.net/ttv-boxart/23020_IGDB-285x380.jpg', type: 'game' },
    'Roblox.exe': { name: 'Roblox', icon: 'https://static-cdn.jtvnw.net/ttv-boxart/23020_IGDB-285x380.jpg', type: 'game' },
    'GenshinImpact.exe': { name: 'Genshin Impact', icon: 'https://static-cdn.jtvnw.net/ttv-boxart/513181_IGDB-285x380.jpg', type: 'game' },
    'aces.exe': { name: 'War Thunder', icon: 'https://static-cdn.jtvnw.net/ttv-boxart/66366_IGDB-285x380.jpg', type: 'game' },
    'WarThunder.exe': { name: 'War Thunder', icon: 'https://static-cdn.jtvnw.net/ttv-boxart/66366_IGDB-285x380.jpg', type: 'game' },
    'FortniteClient-Win64-Shipping.exe': { name: 'Fortnite', icon: 'https://static-cdn.jtvnw.net/ttv-boxart/33214_IGDB-285x380.jpg', type: 'game' },

    // New games from Steam library
    'witcher3.exe': { name: 'The Witcher 3', icon: 'https://static-cdn.jtvnw.net/ttv-boxart/115977_IGDB-285x380.jpg', type: 'game' },
    'r5apex.exe': { name: 'Apex Legends', icon: 'https://static-cdn.jtvnw.net/ttv-boxart/511224_IGDB-285x380.jpg', type: 'game' },
    'arma3.exe': { name: 'Arma 3', icon: 'https://static-cdn.jtvnw.net/ttv-boxart/30028_IGDB-285x380.jpg', type: 'game' },
    'arma3_x64.exe': { name: 'Arma 3', icon: 'https://static-cdn.jtvnw.net/ttv-boxart/30028_IGDB-285x380.jpg', type: 'game' },
    'Content Warning.exe': { name: 'Content Warning', icon: 'https://static-cdn.jtvnw.net/ttv-boxart/394758168_IGDB-285x380.jpg', type: 'game' },
    'deadlock.exe': { name: 'Deadlock', icon: 'https://static-cdn.jtvnw.net/ttv-boxart/1908684124_IGDB-285x380.jpg', type: 'game' },
    'project8.exe': { name: 'Deadlock', icon: 'https://static-cdn.jtvnw.net/ttv-boxart/1908684124_IGDB-285x380.jpg', type: 'game' },
    'Phasmophobia.exe': { name: 'Phasmophobia', icon: 'https://static-cdn.jtvnw.net/ttv-boxart/518064_IGDB-285x380.jpg', type: 'game' },
    'TslGame.exe': { name: 'PUBG: BATTLEGROUNDS', icon: 'https://static-cdn.jtvnw.net/ttv-boxart/493057_IGDB-285x380.jpg', type: 'game' },
    'RustClient.exe': { name: 'Rust', icon: 'https://static-cdn.jtvnw.net/ttv-boxart/26348_IGDB-285x380.jpg', type: 'game' },
    'Squad.exe': { name: 'Squad', icon: 'https://static-cdn.jtvnw.net/ttv-boxart/488632_IGDB-285x380.jpg', type: 'game' },
    'SquadGame.exe': { name: 'Squad', icon: 'https://static-cdn.jtvnw.net/ttv-boxart/488632_IGDB-285x380.jpg', type: 'game' },
    'TheForest.exe': { name: 'The Forest', icon: 'https://static-cdn.jtvnw.net/ttv-boxart/33857_IGDB-285x380.jpg', type: 'game' },
    'RainbowSix.exe': { name: 'Rainbow Six Siege', icon: 'https://static-cdn.jtvnw.net/ttv-boxart/460630_IGDB-285x380.jpg', type: 'game' },
    'RainbowSix_Vulkan.exe': { name: 'Rainbow Six Siege', icon: 'https://static-cdn.jtvnw.net/ttv-boxart/460630_IGDB-285x380.jpg', type: 'game' },
    '7DaysToDie.exe': { name: '7 Days to Die', icon: 'https://static-cdn.jtvnw.net/ttv-boxart/27136_IGDB-285x380.jpg', type: 'game' },
    'BeamNG.drive.x64.exe': { name: 'BeamNG.drive', icon: 'https://static-cdn.jtvnw.net/ttv-boxart/70440_IGDB-285x380.jpg', type: 'game' },
    'cms2018.exe': { name: 'Car Mechanic Simulator 2018', icon: 'https://static-cdn.jtvnw.net/ttv-boxart/497424_IGDB-285x380.jpg', type: 'game' },
    'RelicCoH2.exe': { name: 'Company of Heroes 2', icon: 'https://static-cdn.jtvnw.net/ttv-boxart/33075_IGDB-285x380.jpg', type: 'game' },
    'DCS.exe': { name: 'DCS World', icon: 'https://static-cdn.jtvnw.net/ttv-boxart/21971_IGDB-285x380.jpg', type: 'game' },
    'Deceit.exe': { name: 'Deceit', icon: 'https://static-cdn.jtvnw.net/ttv-boxart/494519_IGDB-285x380.jpg', type: 'game' },
    'destiny2.exe': { name: 'Destiny 2', icon: 'https://static-cdn.jtvnw.net/ttv-boxart/497057_IGDB-285x380.jpg', type: 'game' },
    'Devour.exe': { name: 'DEVOUR', icon: 'https://static-cdn.jtvnw.net/ttv-boxart/512942_IGDB-285x380.jpg', type: 'game' },
    'dontstarve_steam.exe': { name: "Don't Starve Together", icon: 'https://static-cdn.jtvnw.net/ttv-boxart/32629_IGDB-285x380.jpg', type: 'game' }
};

const SHARING_BLACKLIST = [
    'NVIDIA GeForce Experience',
    'NVIDIA Share',
    'NVIDIA Overlay',
    'Microsoft Text Input Application',
    'Settings',
    'Task Manager',
    'Program Manager',
    'Search',
    'Start',
    'Shell Experience Host',
    'Settings',
    'Action Center'
];

function scheduleNextScan() {
    if (currentScanTimeout) clearTimeout(currentScanTimeout);
    currentScanTimeout = setTimeout(scanActivities, adaptiveInterval);
}

const FG_SCRIPT = `$hwnd = (Add-Type -MemberDefinition @'[DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();'@ -Name "Win32" -Namespace "Win32" -PassThru)::GetForegroundWindow()
if ($hwnd -ne 0) {
    (Get-Process | Where-Object { $_.MainWindowHandle -eq $hwnd }).ProcessName + ".exe"
}`;

const STEAM_ID_SCRIPT = `Get-ItemProperty -Path 'HKCU:\\Software\\Valve\\Steam' -Name 'RunningAppID' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty RunningAppID`;

async function getSteamAppId() {
    return new Promise((resolve) => {
        exec(`powershell -Command "${STEAM_ID_SCRIPT}"`, (err, stdout) => {
            if (err || !stdout.trim()) resolve(null);
            else resolve(stdout.trim());
        });
    });
}

async function getGameMetadata(appId, exeName = null) {
    const cacheKey = appId || exeName;
    if (gameMetadataCache.has(cacheKey)) return gameMetadataCache.get(cacheKey);

    let metadata = { name: 'Unknown Game', icon: null, type: 'game' };

    try {
        // If we don't have a key, we can't do much with SGDB
        if (!STEAMGRID_API_KEY) {
            if (appId) {
                const steamRes = await axios.get(`https://store.steampowered.com/api/appdetails?appids=${appId}`);
                if (steamRes.data[appId]?.success) {
                    metadata.name = steamRes.data[appId].data.name;
                    metadata.icon = `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`;
                }
            } else if (exeName && KNOWN_GAMES[exeName]) {
                metadata = { ...KNOWN_GAMES[exeName] };
            }
            gameMetadataCache.set(cacheKey, metadata);
            return metadata;
        }

        const headers = { 'Authorization': `Bearer ${STEAMGRID_API_KEY}` };

        // 1. Get Game Object and Name
        let sgdbGameId = null;
        if (appId) {
            try {
                const gameRes = await axios.get(`https://www.steamgriddb.com/api/v2/games/steam/${appId}`, { headers });
                if (gameRes.data.success) {
                    metadata.name = gameRes.data.data.name;
                    sgdbGameId = gameRes.data.data.id;
                }
            } catch (e) { log.warn(`SGDB Game lookup failed for Steam ID ${appId}`); }
        }

        // Fallback for name if SGDB lookup failed but we have appId
        if (appId && metadata.name === 'Unknown Game') {
            const steamRes = await axios.get(`https://store.steampowered.com/api/appdetails?appids=${appId}`);
            if (steamRes.data[appId]?.success) {
                metadata.name = steamRes.data[appId].data.name;
            }
        } else if (!appId && exeName && KNOWN_GAMES[exeName]) {
            metadata.name = KNOWN_GAMES[exeName].name;
        }

        // 2. Search by name if we still don't have a SGDB ID
        if (!sgdbGameId && metadata.name !== 'Unknown Game') {
            const searchRes = await axios.get(`https://www.steamgriddb.com/api/v2/search/autocomplete/${encodeURIComponent(metadata.name)}`, { headers });
            if (searchRes.data.success && searchRes.data.data.length > 0) {
                sgdbGameId = searchRes.data.data[0].id;
            }
        }

        // 3. Get Assets (Grids)
        if (sgdbGameId) {
            const assetsRes = await axios.get(`https://www.steamgriddb.com/api/v2/grids/game/${sgdbGameId}?dimensions=342x482,600x900`, { headers });
            if (assetsRes.data.success && assetsRes.data.data.length > 0) {
                metadata.icon = assetsRes.data.data[0].url;
            }
        }

        // Final fallbacks for icons
        if (!metadata.icon) {
            if (appId) {
                metadata.icon = `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`;
            } else if (exeName && KNOWN_GAMES[exeName]) {
                metadata.icon = KNOWN_GAMES[exeName].icon;
            }
        }

        gameMetadataCache.set(cacheKey, metadata);
        return metadata;
    } catch (e) {
        log.error("Failed to fetch game metadata", e);
        return metadata.name !== 'Unknown Game' ? metadata : null;
    }
}

async function scanActivities() {
    if (process.platform !== 'win32' || scanInProgress) { scheduleNextScan(); return; }
    scanInProgress = true;

    try {
        // Priority 1: Steam Registry Detection
        const steamAppId = await getSteamAppId();
        if (steamAppId && steamAppId !== '0') {
            const metadata = await getGameMetadata(steamAppId);
            if (metadata) {
                updateActivity(metadata);
                scanInProgress = false;
                adaptiveInterval = 5000;
                scheduleNextScan();
                return;
            }
        }

        // Priority 2: Foreground Window EXE detection
        exec(`powershell -Command "${FG_SCRIPT.replace(/\n/g, '')}"`, async (fgErr, fgStdout) => {
            const fgExe = fgStdout?.trim().toLowerCase();
            if (!fgErr && fgExe) {
                const fgBase = fgExe.endsWith('.exe') ? fgExe.slice(0, -4) : fgExe;

                // Match with KNOWN_GAMES or attempt meta lookup by exe base name
                let foundKey = Object.keys(KNOWN_GAMES).find(key => {
                    const kLower = key.toLowerCase();
                    return fgExe === kLower || fgBase === kLower || fgExe === kLower.replace('.exe', '');
                });

                if (foundKey) {
                    const metadata = await getGameMetadata(null, foundKey);
                    updateActivity(metadata);
                    scanInProgress = false;
                    adaptiveInterval = 3000;
                    scheduleNextScan();
                    return;
                }
            }

            // Priority 3: Full Scan fallback
            performFullScan();
        });
    } catch (err) {
        log.error("Activity scan error:", err);
        scanInProgress = false;
        scheduleNextScan();
    }
}

function updateActivity(foundActivity) {
    const currentName = foundActivity ? foundActivity.name : null;
    const lastName = lastActivity ? lastActivity.name : null;
    if (currentName !== lastName) {
        if (foundActivity) {
            lastActivity = { ...foundActivity };
            activityStartTime = Date.now();
        } else {
            lastActivity = null;
            activityStartTime = null;
        }
        if (mainWindow && !mainWindow.webContents.isDestroyed()) {
            mainWindow.webContents.send('activity-changed', lastActivity ? { ...lastActivity, startTime: activityStartTime } : null);
        }
    }
}

function performFullScan() {
    exec('tasklist /NH /FO CSV', (err, stdout) => {
        scanInProgress = false;
        if (err) { adaptiveInterval = 5000; scheduleNextScan(); return; }
        const lines = stdout.split(/\r?\n/);
        let bestMatch = null;

        // Optimize search by normalizing targets once
        const normalizedGames = Object.keys(KNOWN_GAMES).map(k => ({ key: k, lower: k.toLowerCase(), base: k.toLowerCase().replace('.exe', '') }));

        for (const line of lines) {
            const parts = line.split('","');
            if (parts.length > 0) {
                const exeNameLower = parts[0].replace(/"/g, '').trim().toLowerCase();
                const baseName = exeNameLower.endsWith('.exe') ? exeNameLower.slice(0, -4) : exeNameLower;

                const match = normalizedGames.find(g => exeNameLower === g.lower || baseName === g.base);
                if (match) {
                    bestMatch = KNOWN_GAMES[match.key];
                    break;
                }
            }
        }
        updateActivity(bestMatch);
        adaptiveInterval = bestMatch ? 3000 : 5000;
        scheduleNextScan();
    });
}

scanActivities();

ipcMain.handle('get-current-activity', () => lastActivity ? { ...lastActivity, startTime: activityStartTime } : null);

ipcMain.on('change-icon', (event, iconName) => {
    let iconFile = 'app_icon.ico';
    switch (iconName) {
        case 'icon1': iconFile = 'icon1.PNG'; break;
        case 'icon2': iconFile = 'icon2.png'; break;
        case 'icon3': iconFile = 'icon3.png'; break;
        case 'icon4': iconFile = 'icon4.png'; break;
        default: iconFile = 'app_icon.ico'; break;
    }
    const iconPath = path.join(__dirname, iconFile);
    try {
        if (!fs.existsSync(iconPath)) return;
        const iconImage = nativeImage.createFromPath(iconPath);
        if (iconImage.isEmpty()) return;
        if (mainWindow) mainWindow.setIcon(iconImage);
        if (tray) tray.setImage(iconImage);
    } catch (err) { }
});

ipcMain.handle('toggle-fullscreen', async (event, isFullscreen) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        try {
            mainWindow.setFullScreen(isFullscreen);
            return new Promise((resolve) => setTimeout(() => resolve(mainWindow.isFullScreen()), 100));
        } catch (err) { return false; }
    }
    return false;
});

ipcMain.on('window-minimize', () => { if (mainWindow) mainWindow.minimize(); });
ipcMain.on('window-maximize', () => { if (mainWindow) { if (mainWindow.isMaximized()) mainWindow.unmaximize(); else mainWindow.maximize(); } });
ipcMain.on('window-close', () => { if (mainWindow) mainWindow.close(); });

ipcMain.handle('get-desktop-sources', async (event, options) => {
    let sources = await desktopCapturer.getSources(options);

    // Filter out blacklisted apps
    sources = sources.filter(source => {
        const name = source.name;
        // Skip if empty or in blacklist
        if (!name || name.trim() === '') return false;
        return !SHARING_BLACKLIST.some(blacklisted => name.includes(blacklisted));
    });

    return sources.map(source => ({
        id: source.id,
        name: source.name,
        thumbnail: source.thumbnail.toDataURL(),
        display_id: source.display_id,
        appIcon: source.appIcon ? source.appIcon.toDataURL() : null
    }));
});

ipcMain.handle('set-content-protection', (event, enabled) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setContentProtection(enabled);
    }
});

// --- Native Audio Capture Integration ---
let maxcordAudio = null;
try {
    // Attempt to load the native module. 
    // This might fail if the module was compiled for Node.js but we are running in Electron 
    // and the ABIs don't match. In a production build, electron-builder handles rebuilding.
    maxcordAudio = require('maxcord-native-audio');
    log.info("Native Audio Module loaded successfully.");
} catch (e) {
    log.warn("Failed to load native audio module. Loopback capture will be unavailable.", e);
}

ipcMain.on('start-audio-capture', (event, { pid, mode }) => {
    if (!maxcordAudio) {
        log.warn("start-native-audio called but module is not loaded.");
        return;
    }
    log.info(`[NativeAudio] Attempting to start capture. PID: ${pid}, Mode: ${mode}`);
    try {
        let audioBuffer = [];
        let bufferSizeThreshold = 3; // Batch 3 packets
        let flushTimeout = null;

        const flush = () => {
            if (audioBuffer.length > 0 && event.sender && !event.sender.isDestroyed()) {
                const totalLength = audioBuffer.reduce((acc, val) => acc + val.length, 0);
                const mergedBuffer = Buffer.concat(audioBuffer, totalLength);
                event.sender.send('audio-data-batch', mergedBuffer);
                audioBuffer = [];
            }
            if (flushTimeout) {
                clearTimeout(flushTimeout);
                flushTimeout = null;
            }
        };

        const result = maxcordAudio.start(pid, mode, (data) => {
            if (event.sender && !event.sender.isDestroyed()) {
                if (!Buffer.isBuffer(data)) {
                    event.sender.send('audio-meta', data);
                } else {
                    audioBuffer.push(data);

                    if (audioBuffer.length >= bufferSizeThreshold) {
                        flush();
                    } else if (!flushTimeout) {
                        // Ensure we don't hold data too long
                        flushTimeout = setTimeout(flush, 10);
                    }
                }
            }
        });
        log.info("[NativeAudio] Capture start result:", result);
    } catch (e) {
        log.error("[NativeAudio] Capture execution error:", e);
    }
});

ipcMain.on('stop-audio-capture', () => {
    if (maxcordAudio) {
        log.info("Stopping native capture.");
        maxcordAudio.stop();
    }
});
ipcMain.handle('get-app-pid', () => process.pid);
ipcMain.handle('get-pid-from-hwnd', (event, hwnd) => {
    if (maxcordAudio && maxcordAudio.getPidFromWindowHandle) {
        return maxcordAudio.getPidFromWindowHandle(Number(hwnd));
    }
    return 0;
});
// ----------------------------------------

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
