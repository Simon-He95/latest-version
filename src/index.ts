import { spawnSync } from 'node:child_process'

export function latestVersion(pkgname: string, version?: string) {
  const { status, output } = spawnSync(`npm show ${pkgname} --json`, { encoding: 'utf-8', shell: true })
  if (status === 0) {
    const { versions } = JSON.parse(output.filter(Boolean)[0]!)

    return version
      ? (versions as any).findLast((item: any) => item.startsWith(version))
      : versions[versions.length - 1]
  }
  throw new Error('This package not found')
}
