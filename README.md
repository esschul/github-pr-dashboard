# GitHub PR Dashboard

Small Electron dashboard for pull requests owned by a team. The app uses the
installed GitHub CLI and does not require a separate GitHub token.

## Prerequisites

1. Install `gh`.
2. Log in:

   ```bash
   gh auth login
   ```

3. Install dependencies and start the app:

   ```bash
   npm install
   npm start
   ```

## Install for development

Clone the repository, then run:

```bash
gh auth login
npm install
npm start
```

The GitHub CLI login is the only runtime credential required.

## Team configuration

The dashboard finds repositories by GitHub organization and repository topic.
Both values can be changed in the Settings view. They are stored locally in the
Electron renderer.

The dashboard refreshes every two minutes while it is running. Dependabot pull
requests are shown in their own view.

## Notifications

The first successful refresh establishes a baseline for the selected team.
After that, newly observed human-authored pull requests produce a native system
notification. Clicking the notification opens the pull request on GitHub.
Dependabot pull requests do not produce notifications.
