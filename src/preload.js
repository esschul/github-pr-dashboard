const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('githubDashboard', {
    fetchPullRequests: async (config) => {
        const response = await ipcRenderer.invoke('pull-requests:fetch', config);
        if (!response.ok) {
            throw response.error;
        }
        return response.result;
    },
    openExternal: (url) => ipcRenderer.invoke('external:open', url),
    showNotification: (payload) => ipcRenderer.invoke('notification:show', payload)
});
