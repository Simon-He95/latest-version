export async function fetchLatestVersion(pkgname: string, version = 'latest') {
  return (await import('latest-version')).default(pkgname, { version })
}
