import { exec } from 'node:child_process'
import type { ExecOptions } from 'node:child_process'

export function latestVersion(pkgname: string, options: ExecOptions & { version?: string } = {}) {
  const { version = 'latest', ...execOptions } = options
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
