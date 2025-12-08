# latest-version helper

Resilient utility that fetches the latest (or matching) npm package version by combining `npm view`, `npm show`, and the `latest-version` HTTP API. It adds caching, retries, semver-aware range resolution, and registry overrides so you always get a deterministic answer.

## Install

```bash
npm install @simon_he/latest-version
# or
pnpm add @simon_he/latest-version
```

Requires **Node.js 18.12+**.

## Usage

```ts
import { latestVersion, clearCache } from '@simon_he/latest-version'

const vue = await latestVersion('vue')
// => "3.5.12"

const legacyVue = await latestVersion('vue', { version: 'legacy' })
// => resolves dist-tag using the npm CLI

const pinnedNext = await latestVersion('next', { version: '^14.2.0', retries: 3 })
// => uses semver.maxSatisfying against the registry's full version list

clearCache() // optional helper when running in long-lived processes
```

## API

```ts
latestVersion(pkgname: string, options?: LatestVersionOptions): Promise<string>
clearCache(): void
```

### `LatestVersionOptions`

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `version` | `string` | `'latest'` | Dist-tag or semver range to resolve. |
| `retries` | `number` | `2` | Number of times to retry the entire strategy set when **all** attempts fail. (Deprecated `concurrency` still maps to this.) |
| `timeout` | `number` | `10_000` | Timeout per strategy in milliseconds. |
| `useCache` | `boolean` | `true` | Toggle in-memory caching for identical lookups. |
| `cacheTtl` | `number` | `5 * 60 * 1000` | Cache lifetime in milliseconds. |
| `cwd` | `string` | `process.cwd()` | Working directory passed to the npm CLI (so your `.npmrc` is respected). |
| `registryUrl` | `string` | npm default | Overrides the registry for both CLI calls and the HTTP fallback. |
| `omitDeprecated` | `boolean` | `false` | Skip deprecated releases (propagated to `latest-version`). |
| `includePrerelease` | `boolean` | `false` | Allow pre-release versions when resolving ranges. |

Caching uses a key derived from the package name + relevant options (registry/cwd/range). Entries expire lazily and via periodic cleanup when new entries are added. Call `clearCache()` whenever you need to reset memoized values.

## Development

```bash
npm run lint
npm run test
npm run build
```

Tests are fully mocked and do not touch the public npm registry, so they run quickly and deterministically.

## License

[MIT](./license)

## Sponsors

<p align="center">
  <a href="https://cdn.jsdelivr.net/gh/Simon-He95/sponsor/sponsors.svg">
    <img src="https://cdn.jsdelivr.net/gh/Simon-He95/sponsor/sponsors.png" alt="sponsors"/>
  </a>
</p>
