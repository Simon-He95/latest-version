import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearCache, latestVersion } from '../src/index'

const fetchLatestVersionMock = vi.hoisted(() => vi.fn(async () => '9.9.9'))

const { jsShellMock } = vi.hoisted(() => {
  const registryPayload: Record<string, Record<string, any>> = {
    default: {
      vue: {
        versions: ['2.0.0', '2.7.16', '3.3.10'],
        'dist-tags': { latest: '3.3.10', legacy: '2.7.16' },
      },
      'semver-demo': {
        versions: ['1.0.0', '1.5.0', '2.0.0', '2.10.0'],
        'dist-tags': { latest: '2.10.0' },
      },
    },
    'https://internal.registry/': {
      'semver-demo': {
        versions: ['1.0.0', '1.2.0', '1.3.0'],
        'dist-tags': { latest: '1.3.0' },
      },
    },
  }

  return {
    jsShellMock: vi.fn(async (command: string) => {
      const packageMatch = command.match(/npm (?:view|show) ([^\s]+)/)
      const registryMatch = command.match(/--registry (\S+)/)
      const pkg = packageMatch?.[1]
      const registry = registryMatch ? registryMatch[1] : 'default'
      const payload = (pkg && registryPayload[registry]?.[pkg]) || (pkg ? registryPayload.default[pkg] : null) || registryPayload.default.vue
      return {
        result: JSON.stringify(payload),
        status: 0,
      }
    }),
  }
})

vi.mock('lazy-js-utils/node', () => ({
  jsShell: jsShellMock,
}))

vi.mock('../src/fetchLatestVersion.js', () => ({
  fetchLatestVersion: fetchLatestVersionMock,
}))

describe('latestVersion', () => {
  beforeEach(() => {
    clearCache()
    jsShellMock.mockClear()
    fetchLatestVersionMock.mockClear()
  })

  it('resolves dist-tags via npm cli', async () => {
    const version = await latestVersion('vue', { version: 'legacy', useCache: false })
    expect(version).toBe('2.7.16')
    expect(jsShellMock).toHaveBeenCalled()
  })

  it('uses semver ranges for resolution', async () => {
    const version = await latestVersion('semver-demo', { version: '^2.0.0', useCache: false })
    expect(version).toBe('2.10.0')
  })

  it('differentiates cache entries by registry url', async () => {
    const first = await latestVersion('semver-demo', { registryUrl: 'https://internal.registry/', useCache: true })
    expect(jsShellMock).toHaveBeenCalledTimes(2)

    const second = await latestVersion('semver-demo', { registryUrl: 'https://internal.registry/', useCache: true })
    expect(jsShellMock).toHaveBeenCalledTimes(2)

    const third = await latestVersion('semver-demo', { registryUrl: 'https://another.registry/', useCache: true })
    expect(jsShellMock).toHaveBeenCalledTimes(4)

    expect(first).toBe('1.3.0')
    expect(second).toBe('1.3.0')
    expect(third).toBe('2.10.0')
  })

  it('falls back to latest-version when npm cli fails', async () => {
    jsShellMock.mockRejectedValueOnce(new Error('network down'))
    jsShellMock.mockRejectedValueOnce(new Error('network down'))
    fetchLatestVersionMock.mockResolvedValueOnce('4.0.0')

    const version = await latestVersion('vue', { retries: 1, useCache: false })
    expect(version).toBe('4.0.0')
    expect(fetchLatestVersionMock).toHaveBeenCalledWith('vue', expect.objectContaining({ version: 'latest' }))
  })
})
