const DEPENDABOT_LOGIN = 'app/dependabot';

function isNotificationEligible(payload = {}) {
    return payload.authorLogin !== DEPENDABOT_LOGIN;
}

module.exports = {
    DEPENDABOT_LOGIN,
    isNotificationEligible
};
