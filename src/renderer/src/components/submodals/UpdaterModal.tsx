import React, { useEffect } from 'react'
import styles from '../../style/index.module.css'
import useUpdater from '../../utils/UseUpdater'
import { getLocaleKey } from '@renderer/locales/Locale'

const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  minWidth: '360px',
  marginTop: '16px'
}

const actionStyle: React.CSSProperties = {
  alignSelf: 'flex-start',
  padding: '8px 14px'
}

function versionFrom(info: unknown): string | null {
  if (info && typeof info === 'object' && 'version' in info && typeof info.version === 'string') {
    return info.version
  }

  return null
}

export default function UpdaterModal(): React.ReactElement {
  const { status, progress, info, checkForUpdates, downloadUpdate, previewDownload, installNow } = useUpdater()

  useEffect(() => {
    void checkForUpdates()
  }, [])

  const availableVersion = versionFrom(info)
  const roundedProgress = Math.min(100, Math.max(0, Math.round(progress)))

  let content: React.ReactNode

  switch (status) {
    case 'idle':
    case 'checking':
      content = <p role="status" style={{display: 'flex', gap: '10px'}}><span className={styles['loader']}></span> {getLocaleKey('editor.updaterModal.checkingForUpdates')}</p>
      break
    case 'not-available':
      content = (
        <>
          <p role="status">{getLocaleKey('editor.updaterModal.noUpdatesAvailable')}</p>
          <button type="button" style={actionStyle} onClick={checkForUpdates}>
            {getLocaleKey('editor.updaterModal.checkAgain')}
          </button>
          {import.meta.env.DEV && (
            <button type="button" style={actionStyle} onClick={previewDownload}>
              Preview slow download
            </button>
          )}
        </>
      )
      break
    case 'available':
      content = (
        <>
          <p role="status">
            {getLocaleKey('editor.updaterModal.updateAvailable')}
            {availableVersion ? `: version ${availableVersion}.` : '.'}
          </p>
          <p>{getLocaleKey('editor.updaterModal.updateMessage')}</p>
          <button type="button" style={actionStyle} onClick={downloadUpdate}>
            {getLocaleKey('editor.updaterModal.downloadUpdate')}
          </button>
        </>
      )
      break
    case 'downloading':
      content = (
        <>
          <p role="status">{getLocaleKey('editor.updaterModal.downloadingUpdate')} {roundedProgress}%</p>
          <progress value={roundedProgress} max={100} style={{ width: '100%' }}>
            {roundedProgress}%
          </progress>
        </>
      )
      break
    case 'downloaded':
      content = (
        <>
          <p role="status">
            {getLocaleKey('editor.updaterModal.updateDownloaded')}
          </p>
          <p>{getLocaleKey('editor.updaterModal.updateFinished')}</p>
          <button type="button" style={actionStyle} onClick={installNow}>
            {getLocaleKey('editor.updaterModal.restartNow')}
          </button>
        </>
      )
      break
    case 'error':
      content = (
        <>
          <p role="alert">{getLocaleKey('editor.updaterModal.couldntCheckForUpdates')}</p>
          {typeof info === 'string' && <p style={{ opacity: 0.75 }}>{info}</p>}
          <button type="button" style={actionStyle} onClick={checkForUpdates}>
            {getLocaleKey('editor.updaterModal.tryAgain')}
          </button>
          {import.meta.env.DEV && (
            <button type="button" style={actionStyle} onClick={previewDownload}>
              Preview slow download
            </button>
          )}
        </>
      )
      break
  }

  return (
    <section style={containerStyle} aria-live="polite">
      {content}
    </section>
  )
}
