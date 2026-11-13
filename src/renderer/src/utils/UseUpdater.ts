import { useState, useEffect } from 'react'

interface UpdaterState {
  status:
    | 'idle'
    | 'checking'
    | 'available'
    | 'not-available'
    | 'downloading'
    | 'downloaded'
    | 'error'
  progress: number
  info: unknown
  checkForUpdates: () => Promise<void>
  downloadUpdate: () => Promise<void>
  previewDownload: () => Promise<void>
  installNow: () => Promise<void>
}

export default function useUpdater(): UpdaterState {
  const [status, setStatus] = useState<
    'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'
  >('idle')
  const [progress, setProgress] = useState(0)
  const [info, setInfo] = useState<unknown>(null)

  useEffect(() => {
    const unsubscribe = [
      window.updater.onChecking(() => setStatus('checking')),
      window.updater.onAvailable((_e, i) => {
        setStatus('available')
        setInfo(i)
      }),
      window.updater.onNotAvailable(() => setStatus('not-available')),
      window.updater.onError((_e, msg) => {
        setStatus('error')
        setInfo(msg)
      }),
      window.updater.onProgress((_e, p) => {
        setStatus('downloading')
        setProgress(p.percent)
      }),
      window.updater.onDownloaded((_e, i) => {
        setStatus('downloaded')
        setInfo(i)
      })
    ]
    return () => unsubscribe.forEach((remove) => remove())
  }, [])

  const run = async (action: () => Promise<unknown>): Promise<void> => {
    try {
      await action()
    } catch (error) {
      setStatus('error')
      setInfo(error instanceof Error ? error.message : String(error))
    }
  }
  return {
    status,
    progress,
    info,
    checkForUpdates: () => run(() => window.updater.check()),
    // Only call this after the user explicitly consents
    downloadUpdate: () => run(() => window.updater.download()),
    previewDownload: () => run(() => window.updater.previewDownload()),
    installNow: () => run(() => window.updater.install())
  }
}
