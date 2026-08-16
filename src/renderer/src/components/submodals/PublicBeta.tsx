import Broken from '../../assets/branding/brokenccad.png'
import { openModal } from '../ModalProvider'
import OpenSourceLicensesLogo from '../../assets/icons/oss.svg'
import OSLModal from './OSLModal'
import { getLocaleKey } from '../../locales/Locale'
import React from 'react'

export default function PublicBetaModal(): React.ReactElement {
  const [riskAccepted, setRiskAccepted] = React.useState<boolean>(false);
  const changeNotShowAgain = (e: React.ChangeEvent<HTMLInputElement>) => {
    localStorage.setItem('PUBLICBETA_DoNotShowThatShitEverAgain', e.target.checked ? 'true' : 'false');
    setRiskAccepted(e.target.checked);
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '16px' }}>
      <img src={Broken} alt="CompassCAD logo" width={640} />
      <br />
      <div>
        <p>{getLocaleKey('editor.publicBeta.segments.body_segment1')}</p>
        <p>{getLocaleKey('editor.publicBeta.segments.body_segment2')}</p>
        <br />
        <ol>
          <li>{getLocaleKey('editor.publicBeta.segments.warns.doNotDailyDrive')}</li>
          <li>{getLocaleKey('editor.publicBeta.segments.warns.lotsOfBugs')}</li>
          <li>{getLocaleKey('editor.publicBeta.segments.warns.missingFeatures')}</li>
          <li>{getLocaleKey('editor.publicBeta.segments.warns.noSettingChange')}</li>
          <li>{getLocaleKey('editor.publicBeta.segments.warns.alternative')}</li>
        </ol>
        <br />
        <p>{getLocaleKey('editor.publicBeta.segments.askForConsent')}</p>
        <br />
      </div>
      <div style={{ display: 'flex', gap: '10px' }} >
        <input type="checkbox" /> <p>{getLocaleKey('editor.publicBeta.segments.checkListConsent')}</p>
      </div>
      <br />
      <div style={{ display: 'flex', gap: '10px' }} >
        <input type="checkbox" onChange={changeNotShowAgain} /> <p>{getLocaleKey('editor.publicBeta.segments.dontShow')}</p>
      </div>
      {riskAccepted && <><br /><b><i>{getLocaleKey('editor.publicBeta.segments.riskAccepted')}</i></b></>}
    </div>
  )
}
