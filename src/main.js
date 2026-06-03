const path = require('node:path');
const { execFile } = require('node:child_process');
const { app, BrowserWindow, ipcMain, Notification, shell } = require('electron');
const { fetchPullRequests } = require('./github-client');
const { isNotificationEligible } = require('./notification-policy');

const TEST_NOTIFICATION_URL = 'https://github.com/esschul/github-pr-dashboard/releases/tag/v1.0.1';
const activeNotifications = new Set();

app.setName('GitHub PR Dashboard');

function createWindow() {
    const iconPath = path.join(__dirname, '..', 'assets', 'icon.png');
    const window = new BrowserWindow({
        width: 1180,
        height: 820,
        minWidth: 820,
        minHeight: 620,
        backgroundColor: '#f6f7fb',
        title: 'GitHub PR Dashboard',
        icon: iconPath,
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

function showPullRequestNotification(payload) {
    if (!isNotificationEligible(payload)) {
        return false;
    }
    if (!isGithubUrl(payload?.url)) {
        throw new Error('Only GitHub links can be attached to notifications.');
    }

    if (process.platform === 'darwin') {
        execFile('/usr/bin/osascript', [
            '-e',
            'on run argv',
            '-e',
            'display notification (item 2 of argv) with title (item 1 of argv)',
            '-e',
            'end run',
            String(payload.title || 'New pull request'),
            String(payload.body || '')
        ], (error) => {
            if (error) {
                console.error(`AppleScript notification failed: ${error.message}`);
            }
        });
        return true;
    }

    if (!Notification.isSupported()) {
        return false;
    }

    const notification = new Notification({
        title: String(payload.title || 'New pull request'),
        body: String(payload.body || '')
    });
    const releaseNotification = () => activeNotifications.delete(notification);
    notification.on('click', () => {
        shell.openExternal(payload.url);
        releaseNotification();
    });
    notification.on('close', releaseNotification);
    notification.on('failed', (_event, error) => {
        console.error(`Notification failed: ${error}`);
        releaseNotification();
    });
    notification.on('show', () => console.log('Notification displayed by macOS.'));
    activeNotifications.add(notification);
    notification.show();
    setTimeout(releaseNotification, 60 * 60 * 1000);
    return true;
}

app.whenReady().then(() => {
    if (process.argv.includes('--test-notification')) {
        const wasShown = showPullRequestNotification({
            title: 'New PR in example-org/example-repo',
            body: '#123 Local system notification test',
            authorLogin: 'local-test-user',
            url: TEST_NOTIFICATION_URL
        });
        console.log(`Notification shown: ${wasShown}`);
        setTimeout(() => app.quit(), 1000);
        return;
    }

    const iconPath = path.join(__dirname, '..', 'assets', 'icon.png');
    if (process.platform === 'darwin' && app.dock) {
        app.dock.setIcon(iconPath);
    }

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
        return showPullRequestNotification(payload);
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
