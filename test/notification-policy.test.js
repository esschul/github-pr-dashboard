const assert = require('node:assert/strict');
const test = require('node:test');
const { isNotificationEligible } = require('../src/notification-policy');

test('Dependabot pull requests cannot create system notifications', () => {
    assert.equal(isNotificationEligible({ authorLogin: 'app/dependabot' }), false);
});

test('human-authored pull requests can create system notifications', () => {
    assert.equal(isNotificationEligible({ authorLogin: 'developer' }), true);
});
