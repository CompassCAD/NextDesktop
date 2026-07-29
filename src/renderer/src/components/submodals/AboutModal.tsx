import CompassCADLogo from '../../assets/branding/logo-wordmark.svg'

export default function AboutModal(): React.ReactElement {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '16px' }}>
      <img src={CompassCADLogo} alt="CompassCAD logo" height={36} />
      <br />
      <div>
        <p>CompassCAD NEXT</p>
        <p>Copyright &copy; 2024 - {new Date().getFullYear()} PT Trivi Buat Teknologi & zeankun.</p>
      </div>
    </div>
  )
}
