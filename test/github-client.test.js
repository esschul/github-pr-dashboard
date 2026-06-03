const assert = require('node:assert/strict');
const test = require('node:test');
const { fetchPullRequests, getLocalDateKey, validateConfig } = require('../src/github-client');

test('fetchPullRequests separates human and Dependabot pull requests', async () => {
    const responses = new Map([
        ['repo list bring --topic checkout --no-archived --limit 100 --json nameWithOwner', JSON.stringify([
            { nameWithOwner: 'bring/checkout-api' }
        ])],
        ['pr list --repo bring/checkout-api --limit 100 --json number,title,url,author,isDraft,createdAt,updatedAt,reviewDecision', JSON.stringify([
            {
                number: 2,
                title: 'Dependency update',
                url: 'https://github.com/bring/checkout-api/pull/2',
                author: { login: 'app/dependabot' },
                createdAt: '2026-05-02T12:00:00Z',
                updatedAt: '2026-06-02T12:00:00Z'
            },
            {
                number: 3,
                title: 'Newer dependency update',
                url: 'https://github.com/bring/checkout-api/pull/3',
                author: { login: 'app/dependabot' },
                createdAt: '2026-06-01T12:00:00Z',
                updatedAt: '2026-06-02T13:00:00Z'
            },
            {
                number: 1,
                title: 'Feature',
                url: 'https://github.com/bring/checkout-api/pull/1',
                author: { login: 'developer' },
                createdAt: '2026-06-01T12:00:00Z',
                updatedAt: '2026-06-01T12:00:00Z'
            }
        ])],
        ['pr list --repo bring/checkout-api --state merged --search merged:2026-06-03 --limit 100 --json number,title,url,author,isDraft,createdAt,updatedAt,mergedAt,reviewDecision', JSON.stringify([
            {
                number: 4,
                title: 'Merged feature',
                url: 'https://github.com/bring/checkout-api/pull/4',
                author: { login: 'developer' },
                createdAt: '2026-06-03T08:00:00Z',
                updatedAt: '2026-06-03T09:00:00Z',
                mergedAt: '2026-06-03T09:00:00Z'
            },
            {
                number: 5,
                title: 'Merged dependency update',
                url: 'https://github.com/bring/checkout-api/pull/5',
                author: { login: 'app/dependabot' },
                createdAt: '2026-06-03T10:00:00Z',
                updatedAt: '2026-06-03T11:00:00Z',
                mergedAt: '2026-06-03T11:00:00Z'
            },
            {
                number: 6,
                title: 'Merged yesterday',
                url: 'https://github.com/bring/checkout-api/pull/6',
                author: { login: 'developer' },
                createdAt: '2026-06-02T10:00:00Z',
                updatedAt: '2026-06-02T11:00:00Z',
                mergedAt: '2026-06-02T11:00:00Z'
            }
        ])]
    ]);

    const result = await fetchPullRequests({ organization: 'bring', topic: 'checkout' }, {
        runGhImpl: async (args) => responses.get(args.join(' ')),
        today: '2026-06-03'
    });

    assert.deepEqual(result.repositories, ['bring/checkout-api']);
    assert.deepEqual(result.pullRequests.map(({ number }) => number), [1]);
    assert.deepEqual(result.mergedPullRequests.map(({ number }) => number), [4]);
    assert.deepEqual(result.mergedDependabotPullRequests.map(({ number }) => number), [5]);
    assert.deepEqual(result.dependabotPullRequests.map(({ number }) => number), [2, 3]);
});

test('getLocalDateKey formats a date as YYYY-MM-DD', () => {
    assert.equal(getLocalDateKey('2026-06-03T12:30:00Z'), '2026-06-03');
});

test('validateConfig rejects invalid organization and topic values', () => {
    assert.throws(() => validateConfig({ organization: '../bring', topic: 'checkout' }));
    assert.throws(() => validateConfig({ organization: 'bring', topic: '--topic' }));
});
