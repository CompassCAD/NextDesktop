import React, { useEffect } from 'react'
import useUpdater from '../../utils/UseUpdater'

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
  const { status, progress, info, checkForUpdates, downloadUpdate, installNow } = useUpdater()

  useEffect(() => {
    void checkForUpdates()
  }, [])

  const availableVersion = versionFrom(info)
  const roundedProgress = Math.min(100, Math.max(0, Math.round(progress)))

  let content: React.ReactNode

  switch (status) {
    case 'idle':
    case 'checking':
      content = <p role="status">Checking for updates…</p>
      break
    case 'not-available':
      content = (
        <>
          <p role="status">No updates are available. You’re up to date.</p>
          <button type="button" style={actionStyle} onClick={checkForUpdates}>
            Check again
          </button>
        </>
      )
      break
    case 'available':
      content = (
        <>
          <p role="status">
            Update available{availableVersion ? `: version ${availableVersion}.` : '.'}
          </p>
          <p>Download the update now and install it when it’s ready.</p>
          <button type="button" style={actionStyle} onClick={downloadUpdate}>
            Download update
          </button>
        </>
      )
      break
    case 'downloading':
      content = (
        <>
          <p role="status">Downloading update… {roundedProgress}%</p>
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
            Update downloaded{availableVersion ? `: version ${availableVersion}.` : '.'}
          </p>
          <p>Restart CompassCAD NEXT to finish installing it.</p>
          <button type="button" style={actionStyle} onClick={installNow}>
            Restart and install
          </button>
        </>
      )
      break
    case 'error':
      content = (
        <>
          <p role="alert">We couldn’t check for updates.</p>
          {typeof info === 'string' && <p style={{ opacity: 0.75 }}>{info}</p>}
          <button type="button" style={actionStyle} onClick={checkForUpdates}>
            Try again
          </button>
        </>
      )
      break
  }

  return (
    <section style={containerStyle} aria-live="polite">
      <div>
        <h3 style={{ margin: 0 }}>CompassCAD NEXT updates</h3>
        <p style={{ marginBottom: 0 }}>Keep CompassCAD NEXT current with the latest fixes and improvements.</p>
      </div>
      {content}
    </section>
  )
}
