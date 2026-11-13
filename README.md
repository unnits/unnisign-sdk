# UnniSign SDKs

Client libraries for creating signing procedures on the UnniSign cloud platform.

| Package | Registry name | Runtime |
| --- | --- | --- |
| [PHP SDK](packages/php-sdk) | `unnits/unnisign-sdk` | PHP 8.3+ |
| [Node SDK](packages/node-sdk) | `@unnits/unnisign-sdk` | Node.js 22+ (ES modules) |

The initial API is deliberately small: `createSigningProcedure`, supporting interactive and headless signing, PDF uploads, and the creation endpoint's optional fields.

## Before using either SDK

- Obtain a **client access token** from UnniSign. This is not a user/login token.
- Configure documents and their signature fields in the client's workspace. Each uploaded PDF must reference an **existing document UUID**; the SDK does not provision document templates.
- Use your deployment root as `baseUrl`, e.g. `https://sign.unni.cloud`, **without `/api/v1`**. Deployments under a URL path are also supported.
- PDFs must satisfy the server's PDF validation and 10 MB per-file limit.
- The webhook URL, and redirect URL when supplied, must use the host configured in the client's webhook base URL.
- Headless signing requires the appropriate document certificates/settings in UnniSign. A `202` response means accepted, **not completed**.

See each package's README for installation, usage, and error handling. The registry names are configured, but installation from public registries requires the first release and the account setup below.

## Local development

```sh
# Node workspace (from repository root)
npm ci
npm run check

# PHP package
cd packages/php-sdk
composer install
composer check
```

Node uses TypeScript strict mode and Vitest. PHP uses Mago **1.59.0** for formatting/linting, PHPStan at maximum level, and Pest. Both lockfiles are committed for reproducible contributor/CI installs; consumers resolve dependencies normally.

Tests use local HTTP doubles and synthetic PDF bytes; no cloud credentials, Laravel installation, database, or real signing operation is required. They cover multipart/authentication, options, interactive/headless responses, API errors, transport failures, and invalid responses.

GitHub Actions runs on **every push** and pull request, testing PHP 8.3/8.4/8.5 and Node 22/24. Configure a branch ruleset requiring the CI jobs if these checks should block merging; workflows alone do not enforce branch protection.

## Publishing

Packages are independently versioned, starting at `0.1.0`. Publishing is triggered only by package-prefixed tags, and the release workflow reruns CI before publishing. Nothing is published on an ordinary branch push.

### npm — one-time setup

1. Ensure the `@unnits` npm organization/scope exists and the publishing account has access.
2. Create the GitHub environment `npm`, ideally with required reviewers.
3. Add environment secret `NPM_TOKEN`: an npm granular access token scoped for publishing this package (with the permissions/2FA bypass required by your npm organization).
4. After initial publication, npm trusted publishing can replace the token: configure this repository's `release.yml` workflow and `npm` environment as a trusted publisher. The workflow already grants OIDC permission and requests provenance.

To release, commit and push the code, then create and push a stable tag such as `node-sdk/v0.1.0`. The Git tag is the source of truth: the workflow sets the Node package version from the tag in its temporary checkout before building and publishing. No manual version bump or release commit is needed; the checked-in manifests are not changed by CI. Only stable `node-sdk/vX.Y.Z` tags are accepted (no prereleases or leading zeros).

The workflow builds and publishes only the Node workspace, including declarations, README, and license. Always tag a commit containing the current release workflow. Rerunning an older failed release still uses that older commit and workflow; use a fresh release tag rather than reusing existing tags.

### Composer / Packagist — one-time setup

Packagist expects `composer.json` at a repository root; it cannot install a nested package directly from this monorepo. The release workflow therefore splits `packages/php-sdk` into a **distribution-only repository**.

1. Create an empty public GitHub repository, e.g. `unnits/unnisign-php-sdk`. Do not initialize it with a README or make independent commits there.
2. Create the GitHub environment `composer`, ideally with required reviewers.
3. Set environment variable `PHP_SPLIT_REPOSITORY` to `unnits/unnisign-php-sdk` (an `owner/repository`, not a URL).
4. Add environment secret `PHP_SPLIT_TOKEN`: a fine-grained GitHub token with **Contents: read/write** on that distribution repository. The monorepo's default token cannot write to a different repository.
5. Create and push the first `php-sdk/v0.1.0` tag in this monorepo after committing the package. The workflow splits the PHP directory, updates the distribution repository's `main`, and pushes a normal `v0.1.0` tag there.
6. Submit the **distribution repository** to [Packagist](https://packagist.org/packages/submit), which reads the name `unnits/unnisign-sdk` from its Composer manifest. Enable its GitHub webhook/auto-update integration for subsequent releases.

PHP releases use stable tags `php-sdk/vX.Y.Z`; version metadata is derived from the split Git tag, not hard-coded in `composer.json`. Always release from the main branch in chronological order, and do not reuse release tags. Develop only in this monorepo.

## Scope and operational notes

- Both SDKs send bearer-authenticated multipart requests to `POST /api/v1/signing-procedures`.
- Interactive responses (`200`) include signing links. Headless responses (`202`) have an empty link list. Signing links and webhook payloads contain sensitive tokens; do not log them indiscriminately.
- Requests default to a 30-second timeout, do **not** automatically retry, and do **not** follow redirects. A timed-out creation request may already have succeeded; retrying can create duplicate procedures.
- Use HTTPS in production. HTTP remains available for local development.
- PDFs are held in memory. The server remains authoritative for validation, access permissions, available settings, and workflow configuration.
- These are server-side libraries. Never expose client access tokens in browser bundles.
- Fetch/PDF-template provisioning, procedure lookup/cancellation, signed-document retrieval, webhook handling, and framework integrations are outside this first iteration.

The contract was checked against the Laravel application's routes, store request/response classes, feature tests, and OpenAPI document in the sibling `unnisign` project. The application is reference-only and is not a runtime dependency.

## License

MIT — see [LICENSE](LICENSE).
