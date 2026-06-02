const path = require('node:path');
const { app, BrowserWindow, ipcMain, Notification, shell } = require('electron');
const { fetchPullRequests } = require('./github-client');
const { isNotificationEligible } = require('./notification-policy');

function createWindow() {
    const window = new BrowserWindow({
        width: 1180,
        height: 820,
        minWidth: 820,
        minHeight: 620,
        backgroundColor: '#f6f7fb',
        title: 'GitHub PR Dashboard',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    window.loadFile(path.join(__dirname, 'index.html'));
}

function isGithubUrl(url) {
    return String(url).startsWith('https://github.com/');
}

app.whenReady().then(() => {
    ipcMain.handle('pull-requests:fetch', async (_event, config) => {
        try {
            return {
                ok: true,
                result: await fetchPullRequests(config)
            };
        } catch (error) {
            return {
                ok: false,
                error: {
                    message: 'Could not fetch pull requests.',
                    details: error.details || error.message
                }
            };
        }
    });

    ipcMain.handle('external:open', async (_event, url) => {
        if (!isGithubUrl(url)) {
            throw new Error('Only GitHub links can be opened externally.');
        }

        await shell.openExternal(url);
    });

    ipcMain.handle('notification:show', async (_event, payload) => {
        if (!Notification.isSupported()) {
            return false;
        }
        if (!isNotificationEligible(payload)) {
            return false;
        }
        if (!isGithubUrl(payload?.url)) {
            throw new Error('Only GitHub links can be attached to notifications.');
        }

        const notification = new Notification({
            title: String(payload.title || 'New pull request'),
            body: String(payload.body || '')
        });
        notification.on('click', () => shell.openExternal(payload.url));
        notification.show();
        return true;
    });

    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
