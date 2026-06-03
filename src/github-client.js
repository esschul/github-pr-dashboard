const fs = require('node:fs');
const { execFile } = require('node:child_process');

const DEPENDABOT_LOGIN = 'app/dependabot';
const DEFAULT_CONFIG = Object.freeze({
    organization: 'bring',
    topic: 'checkout'
});
const GH_CANDIDATES = [
    process.env.GH_PATH,
    '/opt/homebrew/bin/gh',
    '/usr/local/bin/gh',
    'gh'
].filter(Boolean);
const OPEN_PR_FIELDS = 'number,title,url,author,isDraft,createdAt,updatedAt,reviewDecision';
const MERGED_PR_FIELDS = 'number,title,url,author,isDraft,createdAt,updatedAt,mergedAt,reviewDecision';

function resolveGhPath() {
    return GH_CANDIDATES.find((candidate) => candidate === 'gh' || fs.existsSync(candidate)) || 'gh';
}

function validateConfig(config = {}) {
    const normalized = {
        organization: String(config.organization || '').trim(),
        topic: String(config.topic || '').trim()
    };

    if (!/^[a-z\d](?:[a-z\d-]{0,38})$/i.test(normalized.organization)) {
        throw new Error('Organization must be a valid GitHub owner login.');
    }
    if (!/^[a-z\d](?:[a-z\d._-]{0,49})$/i.test(normalized.topic)) {
        throw new Error('Topic must be a valid GitHub repository topic.');
    }

    return normalized;
}

function runGh(args, options = {}) {
    const execFileImpl = options.execFileImpl || execFile;
    const ghPath = options.ghPath || resolveGhPath();

    return new Promise((resolve, reject) => {
        execFileImpl(ghPath, args, {
            encoding: 'utf8',
            maxBuffer: 10 * 1024 * 1024,
            timeout: 60_000
        }, (error, stdout, stderr) => {
            if (error) {
                const details = String(stderr || stdout || error.message).trim();
                const commandError = new Error(details || `Could not run ${ghPath}.`);
                commandError.details = details;
                reject(commandError);
                return;
            }

            resolve(stdout);
        });
    });
}

function parseJson(output, description) {
    try {
        return JSON.parse(output);
    } catch (_error) {
        throw new Error(`GitHub CLI returned invalid JSON while fetching ${description}.`);
    }
}

function getLocalDateKey(value) {
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) {
        return '';
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

async function fetchPullRequests(config = DEFAULT_CONFIG, options = {}) {
    const normalizedConfig = validateConfig(config);
    const run = options.runGhImpl || runGh;
    const today = options.today || getLocalDateKey();
    const repositories = parseJson(await run([
        'repo',
        'list',
        normalizedConfig.organization,
        '--topic',
        normalizedConfig.topic,
        '--no-archived',
        '--limit',
        '100',
        '--json',
        'nameWithOwner'
    ]), 'repositories');

    const repositoryPullRequestLists = await Promise.all(repositories.map(async ({ nameWithOwner }) => {
        const pullRequests = parseJson(await run([
            'pr',
            'list',
            '--repo',
            nameWithOwner,
            '--limit',
            '100',
            '--json',
            OPEN_PR_FIELDS
        ]), `pull requests for ${nameWithOwner}`);

        const mergedPullRequests = parseJson(await run([
            'pr',
            'list',
            '--repo',
            nameWithOwner,
            '--state',
            'merged',
            '--search',
            `merged:${today}`,
            '--limit',
            '100',
            '--json',
            MERGED_PR_FIELDS
        ]), `merged pull requests for ${nameWithOwner}`);

        return {
            pullRequests: pullRequests.map((pullRequest) => ({
                ...pullRequest,
                repository: nameWithOwner
            })),
            mergedPullRequests: mergedPullRequests.map((pullRequest) => ({
                ...pullRequest,
                repository: nameWithOwner
            }))
        };
    }));

    const pullRequests = repositoryPullRequestLists
        .flatMap(({ pullRequests }) => pullRequests)
        .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
    const mergedPullRequests = repositoryPullRequestLists
        .flatMap(({ mergedPullRequests }) => mergedPullRequests)
        .filter((pullRequest) => getLocalDateKey(pullRequest.mergedAt) === today)
        .sort((left, right) => String(right.mergedAt).localeCompare(String(left.mergedAt)));

    return {
        config: normalizedConfig,
        repositories: repositories.map(({ nameWithOwner }) => nameWithOwner),
        pullRequests: pullRequests.filter((pullRequest) => pullRequest.author?.login !== DEPENDABOT_LOGIN),
        mergedPullRequests: mergedPullRequests.filter((pullRequest) => pullRequest.author?.login !== DEPENDABOT_LOGIN),
        mergedDependabotPullRequests: mergedPullRequests.filter((pullRequest) => pullRequest.author?.login === DEPENDABOT_LOGIN),
        dependabotPullRequests: pullRequests
            .filter((pullRequest) => pullRequest.author?.login === DEPENDABOT_LOGIN)
            .sort((left, right) => String(left.createdAt).localeCompare(String(right.createdAt))),
        refreshedAt: new Date().toISOString()
    };
}

module.exports = {
    DEFAULT_CONFIG,
    DEPENDABOT_LOGIN,
    fetchPullRequests,
    getLocalDateKey,
    resolveGhPath,
    runGh,
    validateConfig
};
