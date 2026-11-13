import CompassCADLogo from '../../assets/branding/logo-wordmark.svg'
import OSLModal from './OSLModal'
import { getLocaleKey } from '../../locales/Locale'
import React, { useState, useEffect } from 'react'

export default function AboutModal(): React.ReactElement {
  const [version, setVersion] = useState('')

  useEffect(() => {
    let active = true
    void window.api
      .getAppVersion()
      .then((ver) => {
        if (active) setVersion(ver)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '16px' }}>
      <img src={CompassCADLogo} alt="CompassCAD logo" height={36} />
      <br />
      <div>
        <p>CompassCAD NEXT (version {version})</p>
        <p>Copyright &copy; 2024 - {new Date().getFullYear()} PT Trivi Buat Teknologi & zeankun.</p>
      </div>
      <br />
      <details>
        <summary style={{ cursor: 'pointer', marginBottom: '10px' }}>
          {getLocaleKey('editor.about.openSourceLicenses')}
        </summary>
        <OSLModal />
      </details>
    </div>
  )
}
