import getLatestVersion from 'latest-version'

export function fetchLatestVersion(pkgname: string, version = 'latest') {
  return getLatestVersion(pkgname, { version })
}
