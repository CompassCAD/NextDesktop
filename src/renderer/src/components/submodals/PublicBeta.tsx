import Broken from '../../assets/branding/brokenccad.png'
import { openModal } from '../ModalProvider'
import OpenSourceLicensesLogo from '../../assets/icons/oss.svg'
import OSLModal from './OSLModal'
import { getLocaleKey } from '../../locales/Locale'

export default function PublicBetaModal(): React.ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '16px' }}>
      <img src={Broken} alt="CompassCAD logo" width={640} />
      <br />
      <div>
        <p>Welcome to the CompassCAD NEXT Desktop Public Beta! We're proud that you are here!</p>
        <p>Before you can get started, we'd like to warn you of the following things.</p>
        <br />
        <ol>
          <li>Please do not daily drive this version of CompassCAD yet.</li>
          <li>Keep in mind that there will be LOTS OF BUGS, incomplete/unfunctional buttons.</li>
          <li>There will be a LOT of missing features/buttons than desktop/web.</li>
          <li>There are no ways for you to change settings (as of now). If you want to, you'll need to get hacky.</li>
          <li>If you want somewhere to still daily drive, use CompassCAD Desktop ({'<'} 2.1.0) or the web.</li>
        </ol>
        <br />
        <p>With that out of the way, let's start by checking "I Consent" and then closing this popup.</p>
        <br />
      </div>
      <div style={{ display: 'flex', gap: '10px' }} >
        <input type="checkbox" /> <p>I consent that there will be bugs and will not be responsible for design losses.</p>
      </div>
      <br />
      <div style={{ display: 'flex', gap: '10px' }} >
        <input type="checkbox" /> <p>Don't show again, please.</p>
      </div>
    </div>
  )
}
