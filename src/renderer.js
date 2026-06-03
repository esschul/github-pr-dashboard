const REFRESH_INTERVAL_MS = 2 * 60 * 1000;
const STORAGE_KEYS = {
    commentActivitySeen: 'github-pr-dashboard:comment-activity-seen',
    config: 'github-pr-dashboard:config',
    mentionsSeen: 'github-pr-dashboard:mentions-seen',
    seenPullRequests: 'github-pr-dashboard:seen-pull-requests',
    theme: 'github-pr-dashboard:theme'
};
const navItems = Array.from(document.querySelectorAll('.nav-item[data-view]'));
const teamLabel = document.getElementById('teamLabel');
const viewEyebrow = document.getElementById('viewEyebrow');
const viewTitle = document.getElementById('viewTitle');
const refreshButton = document.getElementById('refreshButton');
const themeButton = document.getElementById('themeButton');
const themeIcon = document.getElementById('themeIcon');
const statusPanel = document.getElementById('statusPanel');
const errorPanel = document.getElementById('errorPanel');
const pullRequestsView = document.getElementById('pullRequestsView');
const mergedTodayView = document.getElementById('mergedTodayView');
const dependabotView = document.getElementById('dependabotView');
const settingsView = document.getElementById('settingsView');
const pullRequestsList = document.getElementById('pullRequestsList');
const mergedTodayList = document.getElementById('mergedTodayList');
const mergedTodayDependabotList = document.getElementById('mergedTodayDependabotList');
const dependabotList = document.getElementById('dependabotList');
const pullRequestsCount = document.getElementById('pullRequestsCount');
const mergedTodayCount = document.getElementById('mergedTodayCount');
const dependabotCount = document.getElementById('dependabotCount');
const settingsForm = document.getElementById('settingsForm');
const organizationInput = document.getElementById('organizationInput');
const topicInput = document.getElementById('topicInput');

let activeView = 'pull-requests';
let refreshInProgress = false;
let latestPullRequestsByUrl = new Map();

function readStoredJson(key, fallback) {
    try {
        return JSON.parse(window.localStorage.getItem(key)) || fallback;
    } catch (_error) {
        return fallback;
    }
}

function getConfig() {
    return readStoredJson(STORAGE_KEYS.config, null);
}

function hasCompleteConfig(config) {
    return Boolean(config?.organization?.trim() && config?.topic?.trim());
}

function saveConfig(config) {
    window.localStorage.setItem(STORAGE_KEYS.config, JSON.stringify(config));
}

function getSeenCommentActivityState(config) {
    const states = readStoredJson(STORAGE_KEYS.commentActivitySeen, {});
    return states[getTeamKey(config)] || {};
}

function saveSeenCommentActivityState(config, state) {
    const states = readStoredJson(STORAGE_KEYS.commentActivitySeen, {});
    states[getTeamKey(config)] = state;
    window.localStorage.setItem(STORAGE_KEYS.commentActivitySeen, JSON.stringify(states));
}

function getSeenMentionState(config) {
    const states = readStoredJson(STORAGE_KEYS.mentionsSeen, {});
    return states[getTeamKey(config)] || {
        initialized: false,
        ids: []
    };
}

function saveSeenMentionState(config, state) {
    const states = readStoredJson(STORAGE_KEYS.mentionsSeen, {});
    states[getTeamKey(config)] = state;
    window.localStorage.setItem(STORAGE_KEYS.mentionsSeen, JSON.stringify(states));
}

function getTeamKey(config) {
    return `${config.organization}/${config.topic}`;
}

function getSeenPullRequestState(config) {
    const states = readStoredJson(STORAGE_KEYS.seenPullRequests, {});
    return states[getTeamKey(config)] || {
        initialized: false,
        urls: []
    };
}

function saveSeenPullRequestState(config, state) {
    const states = readStoredJson(STORAGE_KEYS.seenPullRequests, {});
    states[getTeamKey(config)] = state;
    window.localStorage.setItem(STORAGE_KEYS.seenPullRequests, JSON.stringify(states));
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escapeAttribute(value) {
    return escapeHtml(value);
}

function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
        ? ''
        : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function getReviewLabel(pullRequest) {
    if (pullRequest.isDraft) return 'Draft';
    return {
        APPROVED: 'Approved',
        CHANGES_REQUESTED: 'Changes requested',
        REVIEW_REQUIRED: 'Review required'
    }[pullRequest.reviewDecision] || 'Open';
}

function getReviewStatusClass(pullRequest, statusLabel) {
    if (statusLabel === 'Merged') return 'is-merged';
    if (pullRequest.isDraft) return 'is-draft';
    return {
        APPROVED: 'is-approved',
        CHANGES_REQUESTED: 'is-changes-requested',
        REVIEW_REQUIRED: 'is-pending'
    }[pullRequest.reviewDecision] || 'is-open';
}

function getAgeDetails(createdAt) {
    const createdDate = new Date(createdAt);
    if (Number.isNaN(createdDate.getTime())) {
        return null;
    }

    const ageInDays = Math.max(0, Math.floor((Date.now() - createdDate.getTime()) / (24 * 60 * 60 * 1000)));
    const level = ageInDays >= 30
        ? 'critical'
        : ageInDays >= 14
            ? 'warning'
            : ageInDays >= 7
                ? 'notice'
                : 'fresh';

    return {
        ageInDays,
        label: ageInDays === 0 ? 'Opened today' : `${ageInDays} day${ageInDays === 1 ? '' : 's'} old`,
        level
    };
}

function renderPullRequestList(element, pullRequests, emptyMessage, options = {}) {
    if (!pullRequests.length) {
        element.innerHTML = `<section class="panel empty-state">${escapeHtml(emptyMessage)}</section>`;
        return;
    }

    element.innerHTML = pullRequests.map((pullRequest) => {
        const ageDetails = options.showAge ? getAgeDetails(pullRequest.createdAt) : null;
        return `
        <article class="pull-request-card">
            <div>
                <p class="eyebrow">${escapeHtml(pullRequest.repository)}</p>
                <h3>${escapeHtml(pullRequest.title)}</h3>
                <p class="pull-request-meta">
                    <span>#${escapeHtml(pullRequest.number)}</span>
                    <span>·</span>
                    <span>${escapeHtml(pullRequest.author?.login || 'Unknown author')}</span>
                    <span>·</span>
                    <span>${escapeHtml(options.dateLabel || 'Updated')} ${escapeHtml(formatDate(pullRequest[options.dateField || 'updatedAt']))}</span>
                </p>
            </div>
            <div class="pull-request-actions">
                ${pullRequest.hasNewComments ? '<span class="comment-pill">New comments</span>' : ''}
                ${ageDetails ? `<span class="age-pill is-${ageDetails.level}">${escapeHtml(ageDetails.label)}</span>` : ''}
                <span class="status-pill ${escapeHtml(getReviewStatusClass(pullRequest, options.statusLabel))}">${escapeHtml(options.statusLabel || getReviewLabel(pullRequest))}</span>
                <button class="secondary-button" type="button" data-pull-request-url="${escapeAttribute(pullRequest.url)}">Open</button>
            </div>
        </article>
    `;
    }).join('');
}

function renderResult(result) {
    markNewCommentActivity(result);
    renderPullRequestList(pullRequestsList, result.pullRequests, 'No human-authored pull requests are open.');
    renderPullRequestList(mergedTodayList, result.mergedPullRequests, 'No human-authored pull requests have been merged today.', {
        dateField: 'mergedAt',
        dateLabel: 'Merged',
        statusLabel: 'Merged'
    });
    renderPullRequestList(mergedTodayDependabotList, result.mergedDependabotPullRequests, 'No Dependabot pull requests have been merged today.', {
        dateField: 'mergedAt',
        dateLabel: 'Merged',
        statusLabel: 'Merged'
    });
    renderPullRequestList(dependabotList, result.dependabotPullRequests, 'No Dependabot pull requests are open.', { showAge: true });
    pullRequestsCount.textContent = result.pullRequests.length;
    mergedTodayCount.textContent = result.mergedPullRequests.length + result.mergedDependabotPullRequests.length;
    dependabotCount.textContent = result.dependabotPullRequests.length;
    teamLabel.textContent = `${result.config.organization} / ${result.config.topic}`;
    statusPanel.textContent = `${result.repositories.length} repositories · Updated ${formatDate(result.refreshedAt)}`;
}

function markNewCommentActivity(result) {
    const seenActivity = getSeenCommentActivityState(result.config);
    const nextSeenActivity = { ...seenActivity };
    const pullRequests = [
        ...(result.pullRequests || []),
        ...(result.dependabotPullRequests || [])
    ];
    latestPullRequestsByUrl = new Map(pullRequests.map((pullRequest) => [pullRequest.url, pullRequest]));

    pullRequests.forEach((pullRequest) => {
        if (!pullRequest.commentActivityAt) {
            pullRequest.hasNewComments = false;
            return;
        }

        const previousActivityAt = seenActivity[pullRequest.url];
        pullRequest.hasNewComments = Boolean(previousActivityAt && pullRequest.commentActivityAt > previousActivityAt);
        if (!pullRequest.hasNewComments) {
            nextSeenActivity[pullRequest.url] = pullRequest.commentActivityAt;
        }
    });

    saveSeenCommentActivityState(result.config, nextSeenActivity);
}

function markCommentActivitySeen(url) {
    const pullRequest = latestPullRequestsByUrl.get(url);
    if (!pullRequest?.commentActivityAt) {
        return;
    }

    const config = getConfig();
    const seenActivity = getSeenCommentActivityState(config);
    seenActivity[url] = pullRequest.commentActivityAt;
    saveSeenCommentActivityState(config, seenActivity);
    pullRequest.hasNewComments = false;

    const button = document.querySelector(`[data-pull-request-url="${CSS.escape(url)}"]`);
    const card = button?.closest('.pull-request-card');
    card?.querySelector('.comment-pill')?.remove();
}



async function notifyAboutNewPullRequests(config, pullRequests) {
    const seenState = getSeenPullRequestState(config);
    const seenUrls = new Set(seenState.urls);
    const currentUrls = new Set(pullRequests.map((pullRequest) => pullRequest.url));

    if (!seenState.initialized) {
        saveSeenPullRequestState(config, {
            initialized: true,
            urls: Array.from(currentUrls)
        });
        return;
    }

    const newPullRequests = pullRequests.filter((pullRequest) => !seenUrls.has(pullRequest.url));
    newPullRequests.forEach((pullRequest) => seenUrls.add(pullRequest.url));

    // Keep the persisted set bounded while retaining all currently open PRs.
    const retainedUrls = Array.from(new Set([
        ...currentUrls,
        ...Array.from(seenUrls).slice(-500)
    ]));
    saveSeenPullRequestState(config, {
        initialized: true,
        urls: retainedUrls
    });

    await Promise.all(newPullRequests.map((pullRequest) => window.githubDashboard.showNotification({
        title: `New PR in ${pullRequest.repository}`,
        body: `#${pullRequest.number} ${pullRequest.title}`,
        authorLogin: pullRequest.author?.login,
        url: pullRequest.url
    })));
}

async function refresh() {
    const config = getConfig();
    if (!hasCompleteConfig(config)) {
        statusPanel.textContent = 'Configure GitHub organization and repository topic before refreshing.';
        teamLabel.textContent = 'No team configured';
        setView('settings');
        return;
    }

    if (refreshInProgress) return;

    refreshInProgress = true;
    refreshButton.disabled = true;
    statusPanel.textContent = 'Refreshing pull requests...';
    errorPanel.classList.add('hidden');
    errorPanel.innerHTML = '';

    try {
        const result = await window.githubDashboard.fetchPullRequests(config);
        renderResult(result);
        await notifyAboutNewPullRequests(result.config, result.pullRequests);
        await notifyAboutNewMentions(result.config, result.pullRequests);
    } catch (error) {
        statusPanel.textContent = 'Refresh failed.';
        errorPanel.classList.remove('hidden');
        errorPanel.innerHTML = `
            <strong>${escapeHtml(error.message || 'GitHub CLI request failed.')}</strong>
            ${error.details ? `<pre>${escapeHtml(error.details)}</pre>` : ''}
        `;
    } finally {
        refreshInProgress = false;
        refreshButton.disabled = false;
    }
}

async function notifyAboutNewMentions(config, pullRequests) {
    const seenState = getSeenMentionState(config);
    const seenIds = new Set(seenState.ids);
    const mentionEvents = (pullRequests || []).flatMap((pullRequest) => (pullRequest.mentionEvents || []).map((event) => ({
        ...event,
        pullRequest
    })));

    if (!seenState.initialized) {
        saveSeenMentionState(config, {
            initialized: true,
            ids: mentionEvents.map((event) => event.id)
        });
        return;
    }

    const newMentionEvents = mentionEvents.filter((event) => !seenIds.has(event.id));
    newMentionEvents.forEach((event) => seenIds.add(event.id));
    saveSeenMentionState(config, {
        initialized: true,
        ids: Array.from(seenIds).slice(-500)
    });

    await Promise.all(newMentionEvents.map((event) => window.githubDashboard.showNotification({
        title: `You were mentioned in ${event.pullRequest.repository}`,
        body: `#${event.pullRequest.number} ${event.pullRequest.title}`,
        authorLogin: event.pullRequest.author?.login,
        url: event.url || event.pullRequest.url
    })));
}

function setView(view) {
    activeView = view;
    pullRequestsView.classList.toggle('hidden', view !== 'pull-requests');
    mergedTodayView.classList.toggle('hidden', view !== 'merged-today');
    dependabotView.classList.toggle('hidden', view !== 'dependabot');
    settingsView.classList.toggle('hidden', view !== 'settings');
    refreshButton.classList.toggle('hidden', view === 'settings');
    navItems.forEach((item) => item.classList.toggle('is-active', item.dataset.view === view));

    const labels = {
        'pull-requests': ['Team queue', 'Pull requests'],
        'merged-today': ['Completed today', 'Merged today'],
        dependabot: ['Dependency updates', 'Dependabot'],
        settings: ['Dashboard', 'Settings']
    };
    [viewEyebrow.textContent, viewTitle.textContent] = labels[view];
}

function applyTheme(theme) {
    const normalized = theme === 'dark' ? 'dark' : 'light';
    const nextThemeLabel = normalized === 'dark' ? 'Use light theme' : 'Use dark theme';
    document.documentElement.dataset.theme = normalized;
    window.localStorage.setItem(STORAGE_KEYS.theme, normalized);
    themeIcon.textContent = normalized === 'dark' ? '☀' : '☾';
    themeButton.setAttribute('aria-label', nextThemeLabel);
    themeButton.title = nextThemeLabel;
}

navItems.forEach((item) => {
    item.addEventListener('click', () => setView(item.dataset.view));
});

refreshButton.addEventListener('click', refresh);
themeButton.addEventListener('click', () => {
    applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
});

settingsForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const config = {
        organization: organizationInput.value.trim(),
        topic: topicInput.value.trim()
    };
    if (!hasCompleteConfig(config)) {
        statusPanel.textContent = 'Both GitHub organization and repository topic are required.';
        return;
    }
    saveConfig(config);
    teamLabel.textContent = `${config.organization} / ${config.topic}`;
    setView('pull-requests');
    refresh();
});

document.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-pull-request-url]');
    if (button) {
        markCommentActivitySeen(button.dataset.pullRequestUrl);
        await window.githubDashboard.openExternal(button.dataset.pullRequestUrl);
    }
});

const initialConfig = getConfig();
organizationInput.value = initialConfig?.organization || '';
topicInput.value = initialConfig?.topic || '';
teamLabel.textContent = hasCompleteConfig(initialConfig)
    ? `${initialConfig.organization} / ${initialConfig.topic}`
    : 'No team configured';
applyTheme(window.localStorage.getItem(STORAGE_KEYS.theme));
if (hasCompleteConfig(initialConfig)) {
    setView(activeView);
    refresh();
} else {
    statusPanel.textContent = 'Configure GitHub organization and repository topic to get started.';
    setView('settings');
}
window.setInterval(refresh, REFRESH_INTERVAL_MS);
