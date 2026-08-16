import CompassCADLogo from '../../assets/branding/logo-wordmark.svg'
import { openModal } from '../ModalProvider'
import OpenSourceLicensesLogo from '../../assets/icons/oss.svg'
import OSLModal from './OSLModal'
import { getLocaleKey } from '../../locales/Locale'
import React, { useState, useEffect } from 'react'

export default function AboutModal(): React.ReactElement {
  const [version, setVersion] = useState('');

  useEffect(() => {
    const ver = window.api.getAppVersion();
    setVersion(ver);
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '16px' }}>
      <img src={CompassCADLogo} alt="CompassCAD logo" height={36} />
      <br />
      <div>
        <p>CompassCAD NEXT (version {version})</p>
        <p>Copyright &copy; 2024 - {new Date().getFullYear()} PT Trivi Buat Teknologi & zeankun.</p>
      </div>
      <br />
      <div>
        <button onClick={() => openModal(`${getLocaleKey('editor.about.openSourceLicenses')}      `, <OSLModal />)}>
          <img src={OpenSourceLicensesLogo} height={24} />
          {getLocaleKey('editor.about.openSourceLicenses')}
        </button>
      </div>
    </div>
  )
}
