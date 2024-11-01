import { exec } from 'node:child_process'
import type { ExecOptions } from 'node:child_process'
import { fetchLatestVersion } from './fetchLatestVersion'

export async function latestVersion(pkgname: string, options: ExecOptions & { version?: string, concurrency?: number } = {}) {
  const { version = 'latest', concurrency = 1, ...execOptions } = options
  return cancellablePromiseAny([
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

function cancellablePromise<T>(
  promise: Promise<T>,
  cancel: () => void,
): { promise: Promise<T>, cancel: () => void } {
  let isCanceled = false

  const wrappedPromise = new Promise<T>((resolve, reject) => {
    promise.then(
      (value) => {
        if (isCanceled) {
          reject(new Error('Canceled'))
        }
        else {
          resolve(value)
        }
      },
      (error) => {
        if (isCanceled) {
          reject(new Error('Canceled'))
        }
        else {
          reject(error)
        }
      },
    )
  })

  return {
    promise: wrappedPromise,
    cancel: () => {
      isCanceled = true
      cancel()
    },
  }
}

/**
 * 执行多个 promise 并返回第一个解决的 promise。
 * 如果任何一个 promise 解决，其他的 promise 将被取消。
 * 如果所有的 promise 都拒绝，返回的 promise 将以最后一个拒绝的原因拒绝。
 *
 * @template T - promise 解决值的类型。
 * @param {Array<Promise<T>>} promises - 一个 promise 数组进行竞赛。
 * @returns {Promise<T>} 一个 promise，它以第一个解决的 promise 的值解决，或者如果所有的 promise 都拒绝，则拒绝。
 */
export async function cancellablePromiseAny<T>(
  promises: Array<Promise<T>>,
): Promise<T> {
  const cancelFunctions: Array<() => void> = []
  const wrappedPromises = promises.map((promise, index) => {
    const { promise: wrappedPromise, cancel } = cancellablePromise(
      promise,
      () => {
        cancelFunctions[index] = () => {}
      },
    )
    cancelFunctions.push(cancel)
    return wrappedPromise
  })

  return new Promise((resolve, reject) => {
    let resolved = false
    wrappedPromises.forEach((wrappedPromise) => {
      wrappedPromise.then(
        (value) => {
          if (!resolved) {
            resolved = true
            cancelFunctions.forEach(cancel => cancel())
            resolve(value)
          }
        },
        (error) => {
          if (!resolved && wrappedPromises.every(p => p.catch(() => false))) {
            reject(error)
          }
        },
      )
    })
  })
}
