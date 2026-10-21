# Agent instructions

Read [README.md](README.md) for the client interface and local checks.
Read the [SDK maintenance guide](https://github.com/Sandfi-sh/openapi/blob/main/MAINTAINING.md)
for cross-repository work and the
[release guide](https://github.com/Sandfi-sh/openapi/blob/main/RELEASING.md)
for npm publication.

- Check the working tree, remote revision, and unpublished commits first.
- Change API methods and models through `sandfi-sh/openapi`, then regenerate.
- Keep generated files in `src/generated`; maintain helpers in `src/client.ts`.
- Preserve camelCase conversion, explicit nulls, streaming, and cancellation.
- Use package name `@sandfi-sh/sdk`. Keep its repository URL exact for OIDC.
- Keep `sdk.json`, npm metadata, lockfile, and generated version metadata consistent.
- Run `npm ci` and `npm test` for code changes. Check the packed release artifact.
- Verify a fresh npm installation and an API call after publication.
- Check links, references, commands, and `git diff --check` for prose changes.
- Keep credentials out of Git, documentation, and tool output.
- Update the owning guide and report local, published, and verified state.

Use short, direct sentences, active voice, and consistent technical terms.
