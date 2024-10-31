import { exec } from 'node:child_process'
import type { ExecOptions } from 'node:child_process'
import { fetchLatestVersion } from './fetchLatestVersion'

export async function latestVersion(pkgname: string, options: ExecOptions & { version?: string, concurrency?: number } = {}) {
  const { version = 'latest', concurrency = 1, ...execOptions } = options
  return Promise.any([
    ...Array.from({ length: concurrency }, () => fetchVersion(pkgname, version, execOptions)),
    ...Array.from({ length: concurrency }, () => fetchLatestVersion(pkgname, version)),
  ])
}

function fetchVersion(pkgname: string, version: string, execOptions: ExecOptions) {
  return new Promise<string>((resolve, reject) => {
    exec(`npm show ${pkgname} --json`, { encoding: 'utf-8', ...execOptions }, (err, stdout) => {
      if (err) {
        reject(err)
        return
      }
      try {
        const { versions, 'dist-tags': distTags } = JSON.parse(stdout)
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
  })
}
