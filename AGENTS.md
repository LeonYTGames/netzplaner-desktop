# AGENTS.md

## Project overview
Netzplaner Desktop is an Electron app for editing network plans (nodes/edges) with local persistence, recovery, and export features. UI is in English.

## Tech stack
- Electron 38 (CommonJS: `*.cjs` main/preload/controllers)
- Vanilla JS in `app/index.html` (inline script + modules `app/project-actions.js`, `app/updater.js`)
- Node built-in test runner (`node --test`)
- electron-builder for packaging

## Code style
- CommonJS in Node/Electron main/preload (`require/module.exports`). Use ES modules only if explicitly required.
- Keep changes minimal and consistent with existing style.
- Prefer explicit names, avoid unnecessary abstractions.
- In browser code, use `const/let`, small functions, avoid heavy dependencies.
- Format like surrounding code (indentation, spacing).
- No trailing whitespace where possible.
- **No Abbreviations.** Make intent clear.
- **Readable code:** if you need a standard function which is, by language defaults, not readable or otherwise unreadable code you need to access: create an intermediate function with a clear name on what it does.
- Follow: **YAGNI**, **KISS**, **DRY**. Always, no exceptions.
- **Security:** make sure features that have to do anything with networking are secure

## Structure
- `main.cjs` - Electron main, IPC handlers, window lifecycle
- `preload.cjs` - contextBridge API (`window.netzplaner`)
- `close-controller.cjs`, `project-store.cjs` - testable logic
- `app/index.html` - UI and canvas logic
- `app/project-actions.js`, `app/updater.js` - browser modules
- `test/*.cjs` - Node tests

## Development
- Install: `npm install`
- Run: `npm start`
- Test: `npm test`
- Build: `npm run dist:*`

## Git
- Branch naming: `bugfix/<description-in-kebab-case>`, `feature/<description-in-kebab-case>`
- No commits on master, always create a feature branch + pull request
- Keep commits focused
- Rebase onto latest `origin/master` when requested
- Run tests before pushing
- Always delete merged branches and do not re-use branchnames if they do not make sense for your designated task
- Never push to deleted/merged branches

## Conventions
- UI strings in English
- Grid-aligned node sizes/snap where applicable
- Keyboard navigation for canvas/inspector
- Persistence: autosave + recovery + explicit save
- Don't modify tests to make broken behavior pass; fix implementation

## Review guidelines
- All AI-generated code must be reviewed
- All branches require a pull request (no direct commits to master)
