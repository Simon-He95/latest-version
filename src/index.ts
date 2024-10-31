import { exec } from 'node:child_process'
import { platform } from 'node:os'
import { sep } from 'node:path'
import type { ExecOptions } from 'node:child_process'

export async function latestVersion(pkgname: string, options: ExecOptions & { version?: string, concurrency?: number } = {}) {
  const { version = 'latest', concurrency = 1, ...execOptions } = options
  return Promise.any(Array.from({ length: concurrency }, () => fetchVersion(pkgname, version, execOptions)))
}

function fetchVersion(pkgname: string, version: string, execOptions: ExecOptions) {
  return new Promise<string>((resolve, reject) => {
    const isWindows = platform() === 'win32'
    if (isWindows && execOptions.cwd) {
      execOptions.cwd = (execOptions.cwd as string).split(sep).join(sep)
    }
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
