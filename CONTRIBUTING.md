# Contributing

Thanks for helping make competition discovery clearer and more useful.

Start with the [development guide](docs/development.md) and [architecture](docs/architecture.md). For Next.js changes, read the relevant documentation installed with this repository's Next.js version, as described in `AGENTS.md`.

## Keep changes focused

- Explain the problem and the expected behavior in your issue or pull request.
- Reproduce bugs close to the user experience, then add a regression test before fixing them.
- Keep the directory compact, accessible, and honest about unknown data.
- Preserve private-by-default deployment and workspace boundaries. A public repository does not make personal workspaces public.
- Do not include credentials, private workspace data, or production screenshots containing personal information.
- Generate schema migrations with Drizzle rather than editing generated SQL or metadata by hand.

## Source changes

Read [Sources and data](docs/sources.md) before changing collectors.

Use primary-source evidence, preserve provenance and published date precision, and report partial coverage honestly. Respect authentication, access blocks, crawler rules, and rate limits. Do not introduce a Devpost scraper, guessed event URLs, generated competition artwork, or an implicit claim of publisher permission. Keep third-party licensing separate from the code's MIT license.

Add parser/security fixtures and, where appropriate, a browser test without requesting live competition platforms. Research notes belong in `docs/research/` with links to primary sources.

## Before opening a pull request

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run build
npm audit
```

Install Chromium first if needed: `npx playwright install chromium`.

CI uses fixture data and no production credentials. Vercel preview availability depends on repository permissions and deployment approval; previews must not receive production secrets.

By contributing, you agree that your original contributions are provided under the repository's [MIT License](LICENSE). Preserve notices for third-party material.
