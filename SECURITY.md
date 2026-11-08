# Security

## Report privately

Use **Report a vulnerability** in the repository's [Security tab](https://github.com/danarrigo/siggo/security) to contact maintainers through GitHub's private vulnerability reporting.

Do not put credentials, session cookies, personal notes, or private workspace data in a public issue or pull request. Use fictional records when demonstrating a problem. A useful report describes the impact, affected code, and minimal reproduction steps without accessing someone else's account or data.

## Boundaries to preserve

- The repository is public; the hosted application and personal workspaces remain private.
- Production authentication must not fall back to the credential-free local preview.
- API mutations require the permitted account and canonical origin; scheduled sync requires its secret.
- Source access blocks, rate limits, and authentication requirements must not be bypassed.
- Image handling must not become an arbitrary URL proxy or permit private-network access.
- Tests and previews must not receive production credentials or use real workspace fixtures.

See [Architecture](docs/architecture.md#privacy-boundaries) and [Sources and data](docs/sources.md) for implementation boundaries. The [MIT License](LICENSE) applies to the software, not authorization to access a source or anyone's private workspace.
