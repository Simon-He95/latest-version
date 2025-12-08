interface FallbackFetchOptions {
  version: string
  registryUrl?: string
  omitDeprecated?: boolean
}

export async function fetchLatestVersion(pkgname: string, options: FallbackFetchOptions) {
  const latestVersionModule = await import('latest-version')
  return latestVersionModule.default(pkgname, {
    version: options.version,
    registryUrl: options.registryUrl,
    omitDeprecated: options.omitDeprecated,
  })
}
