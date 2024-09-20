import { describe, expect, it } from 'vitest'
import { latestVersion } from '../src'

describe('should', () => {
  it('npmpkg', async () => {
    const version = await latestVersion('vue', { version: '2.7.16' })
    expect(version).toBe('2.7.16')
  })

  it('tag', async () => {
    const version = await latestVersion('vue', { version: 'legacy' })
    expect(version).toBe('2.7.16')
  })

  it('cwd', async () => {
    // 测试使用用户目录的.npmrc里面配置的源来找包
    const version = await latestVersion('abort-controller', { version: 'latest', cwd: process.cwd() })
    expect(version).toBe('3.0.0')
  })
})
