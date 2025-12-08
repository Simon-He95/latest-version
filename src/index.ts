import { retryAsync } from 'lazy-js-utils'
import { jsShell } from 'lazy-js-utils/node'
import semver from 'semver'
import validatePackageName from 'validate-npm-package-name'
import { fetchLatestVersion } from './fetchLatestVersion.js'

const DEFAULT_TIMEOUT = 10_000
const DEFAULT_RETRIES = 2
const DEFAULT_CACHE_TTL = 5 * 60 * 1000 // 5分钟缓存

const cache = new Map<string, { data: string, expiresAt: number }>()

export interface LatestVersionOptions {
  version?: string
  /**
   * Number of retry attempts when all fetch strategies fail.
   * Defaults to 2 (two additional attempts after the initial failure).
   */
  retries?: number
  /**
   * @deprecated Use `retries` instead.
   */
  concurrency?: number
  timeout?: number
  useCache?: boolean
  cacheTtl?: number
  cwd?: string
  registryUrl?: string
  omitDeprecated?: boolean
  includePrerelease?: boolean
}

interface NormalizedOptions {
  version: string
  retries: number
  timeout: number
  useCache: boolean
  cacheTtl: number
  cwd?: string
  registryUrl?: string
  omitDeprecated?: boolean
  includePrerelease: boolean
}

function normalizeOptions(options: LatestVersionOptions = {}): NormalizedOptions {
  const version = (options.version ?? 'latest').trim() || 'latest'
  const retriesInput = options.retries ?? options.concurrency ?? DEFAULT_RETRIES
  const retries = Number.isFinite(retriesInput) ? Math.max(0, Math.floor(retriesInput)) : DEFAULT_RETRIES

  const timeout = options.timeout ?? DEFAULT_TIMEOUT
  const useCache = options.useCache !== false
  const cacheTtl = options.cacheTtl ?? DEFAULT_CACHE_TTL

  const registryUrl = options.registryUrl ? normalizeRegistry(options.registryUrl) : undefined

  return {
    version,
    retries,
    timeout,
    useCache,
    cacheTtl: Math.max(0, cacheTtl),
    cwd: options.cwd,
    registryUrl,
    omitDeprecated: options.omitDeprecated,
    includePrerelease: options.includePrerelease ?? false,
  }
}

function normalizeRegistry(registryUrl: string): string {
  try {
    return new URL(registryUrl).toString()
  }
  catch {
    throw new Error(`Invalid registry URL: "${registryUrl}"`)
  }
}

function createCacheKey(pkgname: string, options: NormalizedOptions): string {
  return JSON.stringify({
    name: pkgname,
    version: options.version,
    registryUrl: options.registryUrl ?? '',
    cwd: options.cwd ?? '',
    omitDeprecated: options.omitDeprecated ?? false,
    includePrerelease: options.includePrerelease,
  })
}

function getFromCache(key: string): string | null {
  const cached = cache.get(key)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data
  }
  cache.delete(key)
  return null
}

function setCache(key: string, data: string, ttl: number): void {
  cache.set(key, { data, expiresAt: Date.now() + ttl })
  cleanupExpiredEntries()
}

function cleanupExpiredEntries(): void {
  const now = Date.now()
  for (const [key, entry] of cache.entries()) {
    if (entry.expiresAt <= now) {
      cache.delete(key)
    }
  }
}

export function clearCache(): void {
  cache.clear()
}

function assertValidPackageName(pkgname: string): void {
  const result = validatePackageName(pkgname)
  if (!result.validForNewPackages && !result.validForOldPackages) {
    const error = result.errors?.[0] ?? 'Package name is invalid'
    throw new Error(error)
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Operation timeout after ${ms}ms`)), ms)
    promise
      .then((value) => {
        clearTimeout(timer)
        resolve(value)
      })
      .catch((error) => {
        clearTimeout(timer)
        reject(error)
      })
  })
}

function parseVersionData(data: any, options: NormalizedOptions): string {
  const version = options.version
  if (!data) {
    throw new Error('Empty package data')
  }

  const { versions, 'dist-tags': distTags } = data

  if (distTags?.[version]) {
    return distTags[version]
  }

  if (!versions || !Array.isArray(versions) || versions.length === 0) {
    throw new Error('Invalid package data: missing versions array')
  }

  const cleanedVersions = (versions as string[])
    .map(v => (typeof v === 'string' ? v.trim() : ''))
    .filter(Boolean)

  if (!cleanedVersions.length) {
    throw new Error('Invalid package data: versions list is empty')
  }

  if (version === 'latest') {
    return semver.rsort(cleanedVersions)[0]
  }

  const exact = semver.valid(version, { loose: true })
  if (exact && cleanedVersions.includes(exact)) {
    return exact
  }

  const range = semver.validRange(version, { loose: true })
  if (range) {
    const matched = semver.maxSatisfying(cleanedVersions, range, { includePrerelease: options.includePrerelease })
    if (matched) {
      return matched
    }
    throw new Error(`No versions satisfy range "${version}"`)
  }

  const coerced = semver.coerce(version)
  if (coerced) {
    const matched = cleanedVersions.find(v => semver.eq(v, coerced))
    if (matched) {
      return matched
    }
  }

  throw new Error(`Unsupported version or tag "${version}"`)
}

export async function latestVersion(pkgname: string, options: LatestVersionOptions = {}) {
  if (!pkgname || typeof pkgname !== 'string') {
    throw new Error('Package name is required and must be a string')
  }

  assertValidPackageName(pkgname)

  const normalizedOptions = normalizeOptions(options)
  const cacheKey = createCacheKey(pkgname, normalizedOptions)

  if (normalizedOptions.useCache) {
    const cached = getFromCache(cacheKey)
    if (cached) {
      return cached
    }
  }

  try {
    const result = await retryAsync(async () => {
      try {
        const cliResult = await Promise.any([
          withTimeout(fetchVersionWithView(pkgname, normalizedOptions), normalizedOptions.timeout),
          withTimeout(fetchVersionWithShow(pkgname, normalizedOptions), normalizedOptions.timeout),
        ])
        return cliResult
      }
      catch {
        return withTimeout(fetchLatestVersion(pkgname, {
          version: normalizedOptions.version,
          registryUrl: normalizedOptions.registryUrl,
          omitDeprecated: normalizedOptions.omitDeprecated,
        }), normalizedOptions.timeout)
      }
    }, normalizedOptions.retries) as string

    if (normalizedOptions.useCache && result) {
      setCache(cacheKey, result, normalizedOptions.cacheTtl)
    }

    return result
  }
  catch (error) {
    throw new Error(`Failed to fetch version for package "${pkgname}": ${error instanceof Error ? error.message : String(error)}`)
  }
}

async function fetchVersionWithShow(pkgname: string, options: NormalizedOptions) {
  try {
    const registryFlag = options.registryUrl ? ` --registry ${options.registryUrl}` : ''
    const { result, status } = await jsShell(`npm show ${pkgname} --json --no-audit --no-fund --prefer-online${registryFlag}`, {
      errorExit: false,
      cwd: options.cwd,
    })

    if (status !== 0) {
      throw new Error(`npm show failed: ${result}`)
    }

    const data = JSON.parse(result)
    return parseVersionData(data, options)
  }
  catch (error) {
    throw new Error(`fetchVersionWithShow failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

async function fetchVersionWithView(pkgname: string, options: NormalizedOptions) {
  try {
    const registryFlag = options.registryUrl ? ` --registry ${options.registryUrl}` : ''
    const { result, status } = await jsShell(`npm view ${pkgname} --json --no-audit --no-fund --prefer-online${registryFlag}`, {
      errorExit: false,
      cwd: options.cwd,
    })

    if (status !== 0) {
      throw new Error(`npm view failed: ${result}`)
    }

    const data = JSON.parse(result)
    return parseVersionData(data, options)
  }
  catch (error) {
    throw new Error(`fetchVersionWithView failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}
