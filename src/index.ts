import { retryAsync } from 'lazy-js-utils'
import { jsShell } from 'lazy-js-utils/dist/node'
import { fetchLatestVersion } from './fetchLatestVersion'

export async function latestVersion(pkgname: string, options: { version?: string, concurrency?: number } = {}) {
  const { version = 'latest', concurrency = 1 } = options
  return retryAsync(async () => Promise.any([
    fetchVersionWithView(pkgname, version),
    fetchVersionWithShow(pkgname, version),
    fetchLatestVersion(pkgname, version),
  ]), concurrency)
}

async function fetchVersionWithShow(pkgname: string, version: string) {
  const { result, status } = await jsShell(`npm show ${pkgname} --json`, {
    errorExit: false,
  })

  if (status !== 0) {
    return Promise.reject(result)
  }
  const { versions, 'dist-tags': distTags } = JSON.parse(result)
  if (distTags[version]) {
    return distTags[version]
  }
  const ver = (versions as any).findLast((item: any) => item.startsWith(version))
  return ver || versions[versions.length - 1]
}

async function fetchVersionWithView(pkgname: string, version: string) {
  const { result, status } = await jsShell(`npm view ${pkgname} --json`, {
    errorExit: false,
  })

  if (status !== 0) {
    return Promise.reject(result)
  }
  const { versions, 'dist-tags': distTags } = JSON.parse(result)
  if (distTags[version]) {
    return distTags[version]
  }
  const ver = (versions as any).findLast((item: any) => item.startsWith(version))
  return ver || versions[versions.length - 1]
}
