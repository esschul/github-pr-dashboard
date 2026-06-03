const assert = require('node:assert/strict');
const test = require('node:test');
const { fetchPullRequests, getLatestCommentActivity, getLocalDateKey, getMentionEvents, validateConfig } = require('../src/github-client');

test('fetchPullRequests separates human and Dependabot pull requests', async () => {
    const responses = new Map([
        ['repo list example-org --topic team-topic --no-archived --limit 100 --json nameWithOwner', JSON.stringify([
            { nameWithOwner: 'example-org/example-repo' }
        ])],
        ['api user --jq .login', 'developer'],
        ['pr list --repo example-org/example-repo --limit 100 --json number,title,url,author,isDraft,createdAt,updatedAt,reviewDecision,comments,reviews', JSON.stringify([
            {
                number: 2,
                title: 'Dependency update',
                url: 'https://github.com/example-org/example-repo/pull/2',
                author: { login: 'app/dependabot' },
                createdAt: '2026-05-02T12:00:00Z',
                updatedAt: '2026-06-02T12:00:00Z',
                comments: [],
                reviews: []
            },
            {
                number: 3,
                title: 'Newer dependency update',
                url: 'https://github.com/example-org/example-repo/pull/3',
                author: { login: 'app/dependabot' },
                createdAt: '2026-06-01T12:00:00Z',
                updatedAt: '2026-06-02T13:00:00Z',
                comments: [],
                reviews: []
            },
            {
                number: 1,
                title: 'Feature',
                url: 'https://github.com/example-org/example-repo/pull/1',
                author: { login: 'developer' },
                createdAt: '2026-06-01T12:00:00Z',
                updatedAt: '2026-06-01T12:00:00Z',
                comments: [
                    {
                        id: 'comment-1',
                        author: { login: 'reviewer' },
                        body: '@developer please check this',
                        createdAt: '2026-06-01T13:00:00Z',
                        updatedAt: '2026-06-01T13:00:00Z',
                        url: 'https://github.com/example-org/example-repo/pull/1#issuecomment-1'
                    }
                ],
                reviews: [
                    { body: '', submittedAt: '2026-06-01T14:00:00Z' },
                    { body: 'Looks good', submittedAt: '2026-06-01T15:00:00Z' }
                ]
            }
        ])],
        ['pr list --repo example-org/example-repo --state merged --search merged:2026-06-03 --limit 100 --json number,title,url,author,isDraft,createdAt,updatedAt,mergedAt,reviewDecision', JSON.stringify([
            {
                number: 4,
                title: 'Merged feature',
                url: 'https://github.com/example-org/example-repo/pull/4',
                author: { login: 'developer' },
                createdAt: '2026-06-03T08:00:00Z',
                updatedAt: '2026-06-03T09:00:00Z',
                mergedAt: '2026-06-03T09:00:00Z'
            },
            {
                number: 5,
                title: 'Merged dependency update',
                url: 'https://github.com/example-org/example-repo/pull/5',
                author: { login: 'app/dependabot' },
                createdAt: '2026-06-03T10:00:00Z',
                updatedAt: '2026-06-03T11:00:00Z',
                mergedAt: '2026-06-03T11:00:00Z'
            },
            {
                number: 6,
                title: 'Merged yesterday',
                url: 'https://github.com/example-org/example-repo/pull/6',
                author: { login: 'developer' },
                createdAt: '2026-06-02T10:00:00Z',
                updatedAt: '2026-06-02T11:00:00Z',
                mergedAt: '2026-06-02T11:00:00Z'
            }
        ])]
    ]);

    const result = await fetchPullRequests({ organization: 'example-org', topic: 'team-topic' }, {
        runGhImpl: async (args) => responses.get(args.join(' ')),
        today: '2026-06-03'
    });

    assert.deepEqual(result.repositories, ['example-org/example-repo']);
    assert.equal(result.viewerLogin, 'developer');
    assert.deepEqual(result.pullRequests.map(({ number }) => number), [1]);
    assert.equal(result.pullRequests[0].commentActivityAt, '2026-06-01T15:00:00Z');
    assert.equal(result.pullRequests[0].commentActivityCount, 2);
    assert.deepEqual(result.pullRequests[0].mentionEvents.map(({ id }) => id), ['comment-1']);
    assert.deepEqual(result.mergedPullRequests.map(({ number }) => number), [4]);
    assert.deepEqual(result.mergedDependabotPullRequests.map(({ number }) => number), [5]);
    assert.deepEqual(result.dependabotPullRequests.map(({ number }) => number), [2, 3]);
});

test('getMentionEvents detects direct mentions case-insensitively', () => {
    assert.deepEqual(getMentionEvents({
        url: 'https://github.com/example-org/example-repo/pull/1',
        comments: [
            { id: '1', author: { login: 'alice' }, body: 'ping @Esschul', createdAt: '2026-06-03T08:00:00Z' },
            { id: '2', author: { login: 'bob' }, body: 'not @esschulbot', createdAt: '2026-06-03T09:00:00Z' }
        ],
        reviews: [
            { id: '3', author: { login: 'carol' }, body: '@esschul can you approve?', submittedAt: '2026-06-03T10:00:00Z' }
        ]
    }, 'esschul').map(({ id }) => id), ['1', '3']);
});

test('getLatestCommentActivity ignores reviews without a body', () => {
    assert.deepEqual(getLatestCommentActivity({
        comments: [{ createdAt: '2026-06-03T08:00:00Z' }],
        reviews: [
            { body: '', submittedAt: '2026-06-03T09:00:00Z' },
            { body: 'Needs a change', submittedAt: '2026-06-03T10:00:00Z' }
        ]
    }), {
        commentActivityAt: '2026-06-03T10:00:00Z',
        commentActivityCount: 2
    });
});

test('getLocalDateKey formats a date as YYYY-MM-DD', () => {
    assert.equal(getLocalDateKey('2026-06-03T12:30:00Z'), '2026-06-03');
});

test('validateConfig rejects invalid organization and topic values', () => {
    assert.throws(() => validateConfig({ organization: '../example-org', topic: 'team-topic' }));
    assert.throws(() => validateConfig({ organization: 'example-org', topic: '--topic' }));
});
