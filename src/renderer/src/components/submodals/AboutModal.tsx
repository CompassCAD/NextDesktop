import CompassCADLogo from '../../assets/branding/logo-wordmark.svg'
import { openModal } from '../ModalProvider'
import OpenSourceLicensesLogo from '../../assets/icons/oss.svg'
import OSLModal from './OSLModal'

export default function AboutModal(): React.ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '16px' }}>
      <img src={CompassCADLogo} alt="CompassCAD logo" height={36} />
      <br />
      <div>
        <p>CompassCAD NEXT</p>
        <p>Copyright &copy; 2024 - {new Date().getFullYear()} PT Trivi Buat Teknologi & zeankun.</p>
      </div>
      <br />
      <div>
        <button onClick={() => openModal('Open Source Licences      ', <OSLModal />)}>
          <img src={OpenSourceLicensesLogo} height={24 } />
          Open Source Licenses
        </button>
      </div>
    </div>
  )
}
