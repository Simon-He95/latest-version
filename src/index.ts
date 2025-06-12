import { retryAsync } from 'lazy-js-utils'
import { jsShell } from 'lazy-js-utils/node'
import { fetchLatestVersion } from './fetchLatestVersion.js'

// 添加缓存机制
const cache = new Map<string, { data: string, timestamp: number }>()
const CACHE_TTL = 5 * 60 * 1000 // 5分钟缓存

interface LatestVersionOptions {
  version?: string
  concurrency?: number
  timeout?: number
  useCache?: boolean
}

function getCacheKey(pkgname: string, version: string): string {
  return `${pkgname}@${version}`
}

function getFromCache(key: string): string | null {
  const cached = cache.get(key)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data
  }
  cache.delete(key)
  return null
}

function setCache(key: string, data: string): void {
  cache.set(key, { data, timestamp: Date.now() })
}

// 添加超时控制
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Operation timeout after ${ms}ms`)), ms),
    ),
  ])
}

// 提取公共的版本解析逻辑
function parseVersionData(data: any, version: string): string {
  if (!data) {
    throw new Error('Empty package data')
  }

  const { versions, 'dist-tags': distTags } = data

  // 优先使用 dist-tags
  if (distTags?.[version]) {
    return distTags[version]
  }

  // 如果没有 versions 数组，抛出错误
  if (!versions || !Array.isArray(versions)) {
    throw new Error('Invalid package data: missing versions array')
  }

  // 查找匹配的版本
  if (version !== 'latest') {
    const matchedVersion = (versions as any).findLast((item: string) => item.startsWith(version))
    if (matchedVersion) {
      return matchedVersion
    }
  }

  // 返回最新版本
  return versions[versions.length - 1]
}

export async function latestVersion(pkgname: string, options: LatestVersionOptions = {}) {
  const { version = 'latest', concurrency = 1, timeout = 10000, useCache = true } = options

  // 验证包名
  if (!pkgname || typeof pkgname !== 'string') {
    throw new Error('Package name is required and must be a string')
  }

  const cacheKey = getCacheKey(pkgname, version)

  // 检查缓存
  if (useCache) {
    const cached = getFromCache(cacheKey)
    if (cached) {
      return cached
    }
  }

  try {
    // 调整优先级：view 通常比 show 更快，npm API 作为备选
    const result = await retryAsync(async () => Promise.any([
      withTimeout(fetchVersionWithView(pkgname, version), timeout),
      withTimeout(fetchVersionWithShow(pkgname, version), timeout),
      withTimeout(fetchLatestVersion(pkgname, version), timeout),
    ]), concurrency) as string

    // 缓存结果
    if (useCache && result) {
      setCache(cacheKey, result)
    }

    return result
  }
  catch (error) {
    throw new Error(`Failed to fetch version for package "${pkgname}": ${error instanceof Error ? error.message : String(error)}`)
  }
}

async function fetchVersionWithShow(pkgname: string, version: string) {
  try {
    // 添加优化参数来加速命令执行
    const { result, status } = await jsShell(`npm show ${pkgname} --json --no-audit --no-fund --prefer-online`, {
      errorExit: false,
    })

    if (status !== 0) {
      throw new Error(`npm show failed: ${result}`)
    }

    const data = JSON.parse(result)
    return parseVersionData(data, version)
  }
  catch (error) {
    throw new Error(`fetchVersionWithShow failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

async function fetchVersionWithView(pkgname: string, version: string) {
  try {
    // 添加优化参数来加速命令执行
    const { result, status } = await jsShell(`npm view ${pkgname} --json --no-audit --no-fund --prefer-online`, {
      errorExit: false,
    })

    if (status !== 0) {
      throw new Error(`npm view failed: ${result}`)
    }

    const data = JSON.parse(result)
    return parseVersionData(data, version)
  }
  catch (error) {
    throw new Error(`fetchVersionWithView failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}
