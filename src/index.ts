import { jsShell } from 'lazy-js-utils/dist/node'
import { fetchLatestVersion } from './fetchLatestVersion'

export async function latestVersion(pkgname: string, options: { version?: string, concurrency?: number } = {}) {
  const { version = 'latest', concurrency = 1 } = options
  return Promise.any([
    ...Array.from({ length: concurrency }, () => fetchVersionWithView(pkgname, version)),
    ...Array.from({ length: concurrency }, () => fetchVersionWithShow(pkgname, version)),
    ...Array.from({ length: concurrency }, () => fetchLatestVersion(pkgname, version)),
  ])
}

function fetchVersionWithShow(pkgname: string, version: string) {
  return new Promise<string>((resolve, reject) => {
    const { result, status } = jsShell(`npm show ${pkgname} --json`)
    if (status !== 0) {
      reject(result)
      return
    }
    try {
      const { versions, 'dist-tags': distTags } = JSON.parse(result)
      if (distTags[version]) {
        resolve(distTags[version])
        return
      }
      const ver = (versions as any).findLast((item: any) => item.startsWith(version))
      resolve(ver || versions[versions.length - 1])
    }
    catch (error) {
      reject(error)
    }
  })
}

function fetchVersionWithView(pkgname: string, version: string) {
  return new Promise<string>((resolve, reject) => {
    const { result, status } = jsShell(`npm view ${pkgname} --json`)
    if (status !== 0) {
      reject(result)
      return
    }
    try {
      const { versions, 'dist-tags': distTags } = JSON.parse(result)
      if (distTags[version]) {
        resolve(distTags[version])
        return
      }
      const ver = (versions as any).findLast((item: any) => item.startsWith(version))
      resolve(ver || versions[versions.length - 1])
    }
    catch (error) {
      reject(error)
    }
  })
}
