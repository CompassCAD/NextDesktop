import AboutModal from './AboutModal'
import UpdaterModal from './UpdaterModal'
import updateIcon from '../../assets/icons/update.svg'
import { numericPreference } from '../../utils/Preferences'
import {
  numericSettings,
  validNumericSetting,
  measurementUnits,
  resolveUnit,
  type NumericSetting
} from '../../utils/SettingsOptions'
import { useEffect, useRef, useState } from 'react'
import { useRenderer } from '../RendererContextProvider'
import { DerakumaParser } from '../../engine/fontobene/Derakuma'
import { fonts, fontPreference, numberPreference, preference } from '../../utils/Preferences'
import { settingsStorage } from '../../utils/SettingsStorage'
import { GetLanguage, getLocaleKey, locales, supportedLanguages } from '../../locales/Locale'
import en from '../../locales/en.json'
import modalStyle from '../../style/index.module.css'
import style from '../../style/settings.module.css'
import CloseIcon from '../../assets/icons/close.svg'
import gear from '../../assets/icons/settings.svg'
import grid from '../../assets/icons/blueprint.svg'
import logo from '../../assets/icons/newlogo.svg'

const t = (key: keyof typeof en.settings): string => getLocaleKey(`settings.${key}`)
type Section = 'general' | 'canvas' | 'measurements' | 'updates' | 'about'

function FontPreview({
  face,
  size
}: {
  face: keyof typeof fonts
  size: number
}): React.JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let cancelled = false
    const font = new DerakumaParser(fonts[face].source)
    setError('')
    void font
      .ready()
      .then(() => {
        if (cancelled || !ref.current) return
        const canvas = ref.current
        const ctx = canvas.getContext('2d')!
        const dpi = window.devicePixelRatio || 1
        canvas.width = 680 * dpi
        canvas.height = 172 * dpi
        ctx.scale(dpi, dpi)
        ctx.strokeStyle = '#eeeeee'
        ctx.lineWidth = 1.3
        ctx.lineCap = 'round'
        const lines = [
          'the quick brown fox jumps',
          'THE QUICK BROWN FOX JUMPS',
          'over the lazy dog · 0123456789',
          '@#$% ^&*()_+ =[]{}; /<>?'
        ]
        lines.forEach((line, i) => {
          const glyphs = font.getSentenceCommand(line)
          const width = Math.max(...glyphs.flatMap((g) => g.commands.map((p) => p.x)), 1)
          const scale = Math.min(size / 9, 640 / width, 3.2)
          ctx.beginPath()
          for (const glyph of glyphs)
            for (const command of glyph.commands) {
              const x = 16 + command.x * scale
              const y = 32 + i * 38 - command.y * scale
              if (command.command === 'MP') ctx.lineTo(x, y)
              else ctx.moveTo(x, y)
            }
          ctx.stroke()
        })
      })
      .catch((error) => {
        if (!cancelled) setError(t('previewError') + ' ' + String(error))
      })
    return () => {
      cancelled = true
    }
  }, [face, size])
  return (
    <div className={style.preview}>
      <canvas ref={ref} aria-label={t('preview')} role="img" />
      {error && <p role="alert">{error}</p>}
    </div>
  )
}

export default function SettingsModal({ onClose }: { onClose: () => void }): React.JSX.Element {
  const dialog = useRef<HTMLDialogElement>(null)
  const { renderer } = useRenderer()
  const [section, setSection] = useState<Section>('general')
  const [search, setSearch] = useState('')
  const [updatesVisited, setUpdatesVisited] = useState(false)
  const [face, setFace] = useState(fontPreference)
  const [size, setSize] = useState(String(numberPreference('fontSize', 18, 1, 256)))
  const [language, setLanguage] = useState(GetLanguage)
  const [showBeta, setShowBeta] = useState(
    preference('PUBLICBETA_DoNotShowThatShitEverAgain', 'false') !== 'true'
  )
  const [unit, setUnit] = useState(() => resolveUnit(preference('measurementUnit', 'm')))
  const [numbers, setNumbers] = useState(
    () =>
      Object.fromEntries(
        (Object.keys(numericSettings) as NumericSetting[]).map((key) => [
          key,
          String(numericPreference(key))
        ])
      ) as Record<NumericSetting, string>
  )
  const [canvas, setCanvas] = useState({
    snap: preference('snap', 'true') === 'true',
    showGrid: preference('showGrid', 'true') === 'true',
    showOrigin: preference('showOrigin', 'false') === 'true',
    showRules: preference('showRules', 'true') === 'true'
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  useEffect(() => {
    const element = dialog.current!
    element.showModal()
    return () => element.close()
  }, [])
  const close = (): void => {
    if (!savingRef.current) onClose()
  }
  const matches = (key: keyof typeof en.settings): boolean =>
    t(key).toLowerCase().includes(search.toLowerCase().trim())
  const generalKeys = [
    'fontFace',
    'fontSize',
    'preview',
    'language',
    'showBeta',
    'maximumStack'
  ] as const
  const canvasKeys = ['showGrid', 'showOrigin', 'showRules', 'snap'] as const
  const searching = search.trim().length > 0
  const showGeneral = (searching || section === 'general') && generalKeys.some(matches)
  const showCanvas =
    (searching || section === 'canvas') &&
    [...canvasKeys, 'gridSpacing', 'snapTolerance'].some((key) =>
      matches(key as keyof typeof en.settings)
    )
  const showMeasurements =
    (searching || section === 'measurements') &&
    ['measurementUnit', 'measurementPrecision'].some((key) =>
      matches(key as keyof typeof en.settings)
    )
  const showUpdates = searching ? matches('updates') : section === 'updates'
  const showAbout = searching ? matches('about') : section === 'about'
  useEffect(() => {
    if (showUpdates) setUpdatesVisited(true)
  }, [showUpdates])
  const numberInput = (key: NumericSetting): React.JSX.Element | null =>
    matches(key) ? (
      <label className={style.row} key={key}>
        {t(key)}
        <input
          type="number"
          min={numericSettings[key].min}
          max={numericSettings[key].max}
          step={numericSettings[key].step}
          required
          value={numbers[key]}
          onChange={(e) => setNumbers({ ...numbers, [key]: e.target.value })}
        />
      </label>
    ) : null
  const save = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault()
    if (savingRef.current) return
    const fontSize = Number(size)
    if (!Number.isFinite(fontSize) || fontSize < 1 || fontSize > 256) {
      setError(t('invalidSize'))
      return
    }
    if (
      !(Object.keys(numericSettings) as NumericSetting[]).every((key) =>
        validNumericSetting(key, numbers[key])
      )
    ) {
      setError(t('invalidNumbers'))
      return
    }
    savingRef.current = true
    setSaving(true)
    setError('')
    try {
      const font = new DerakumaParser(fonts[face].source)
      await font.ready()
      settingsStorage.setItems({
        fontFace: face,
        fontSize: String(fontSize),
        language,
        measurementUnit: unit,
        ...numbers,
        PUBLICBETA_DoNotShowThatShitEverAgain: String(!showBeta),
        ...Object.fromEntries(Object.entries(canvas).map(([key, value]) => [key, String(value)]))
      })
      renderer?.setStrokeFont(font)
      renderer?.applyPreferences()
      onClose()
    } catch (error) {
      setError(t('error') + ' ' + (error instanceof Error ? error.message : String(error)))
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }
  return (
    <dialog
      ref={dialog}
      className={style.dialog}
      aria-labelledby="settings-title"
      onCancel={(event) => {
        event.preventDefault()
        close()
      }}
      onKeyDown={(event) => event.stopPropagation()}
      onKeyUp={(event) => event.stopPropagation()}
    >
      <form className={[modalStyle['modal-content'], style.layout].join(' ')} onSubmit={save}>
        <aside className={style.sidebar}>
          <h1 id="settings-title">{t('title')}</h1>
          <input
            className={style.search}
            type="search"
            placeholder={t('search')}
            aria-label={t('search')}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            autoFocus
          />
          <nav aria-label={t('title')}>
            {(['general', 'canvas', 'measurements', 'updates', 'about'] as const).map((item) => (
              <button
                key={item}
                type="button"
                aria-current={!searching && section === item ? 'page' : undefined}
                onClick={() => {
                  setSection(item)
                  setSearch('')
                }}
              >
                <img
                  src={
                    item === 'general'
                      ? gear
                      : item === 'updates'
                        ? updateIcon
                        : item === 'about'
                          ? logo
                          : grid
                  }
                  alt=""
                />
                {t(item)}
              </button>
            ))}
          </nav>
          <div className={style.device}>
            <img src={logo} alt="" />
            <div>
              <strong>CompassCAD</strong>
              <small>{t('local')}</small>
            </div>
          </div>
        </aside>
        <main className={style.main}>
          <button
            className={style.close}
            type="button"
            onClick={close}
            aria-label={t('cancel')}
            disabled={saving}
          >
            <img src={CloseIcon} width={24} height={24} alt="" />
          </button>
          <h2 className={style.title}>{searching ? t('search') : t(section)}</h2>
          <div className={style.content}>
            {showGeneral && (
              <section aria-label={t('general')}>
                {searching && <h3>{t('general')}</h3>}
                {matches('fontFace') && (
                  <label className={style.row}>
                    {t('fontFace')}
                    <select
                      value={face}
                      onChange={(e) => setFace(e.target.value as keyof typeof fonts)}
                    >
                      {Object.entries(fonts).map(([key, font]) => (
                        <option key={key} value={key}>
                          {font.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {matches('fontSize') && (
                  <label className={style.row}>
                    {t('fontSize')}
                    <input
                      type="number"
                      min="1"
                      max="256"
                      step="any"
                      required
                      value={size}
                      onChange={(e) => setSize(e.target.value)}
                    />
                  </label>
                )}
                {matches('preview') && (
                  <div className={style.previewGroup}>
                    <p>{t('preview')}</p>
                    <FontPreview face={face} size={Number(size) || 18} />
                    <small>{t('fontHelp')}</small>
                  </div>
                )}
                {matches('language') && (
                  <label className={style.row}>
                    {t('language')}
                    <select
                      value={language}
                      onChange={(e) => setLanguage(e.target.value as typeof language)}
                    >
                      {supportedLanguages.map((code) => (
                        <option key={code} value={code}>
                          {locales[code].name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {numberInput('maximumStack')}
                {matches('maximumStack') && <p className={style.hint}>{t('undoHelp')}</p>}
                {matches('showBeta') && (
                  <label className={style.row}>
                    {t('showBeta')}
                    <input
                      type="checkbox"
                      checked={showBeta}
                      onChange={(e) => setShowBeta(e.target.checked)}
                    />
                  </label>
                )}
              </section>
            )}
            {showCanvas && (
              <section aria-label={t('canvas')}>
                {searching && <h3>{t('canvas')}</h3>}
                {numberInput('gridSpacing')}
                {matches('gridSpacing') && <p className={style.hint}>{t('gridHelp')}</p>}
                {numberInput('snapTolerance')}
                {canvasKeys.filter(matches).map((key) => (
                  <label key={key} className={style.row}>
                    {t(key)}
                    <input
                      type="checkbox"
                      checked={canvas[key]}
                      onChange={(e) => setCanvas({ ...canvas, [key]: e.target.checked })}
                    />
                  </label>
                ))}
              </section>
            )}
            {showMeasurements && (
              <section aria-label={t('measurements')}>
                {searching && <h3>{t('measurements')}</h3>}
                {matches('measurementUnit') && (
                  <>
                    <label className={style.row}>
                      {t('measurementUnit')}
                      <select value={unit} onChange={(e) => setUnit(resolveUnit(e.target.value))}>
                        {Object.entries(measurementUnits).map(([value, option]) => (
                          <option key={value} value={value}>
                            {t(option.label)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <p className={style.hint}>{t('unitsHelp')}</p>
                  </>
                )}
                {numberInput('measurementPrecision')}
              </section>
            )}
            {updatesVisited && (
              <section hidden={!showUpdates} aria-label={t('updates')}>
                {searching && <h3>{t('updates')}</h3>}
                <UpdaterModal />
              </section>
            )}
            {showAbout && (
              <section aria-label={t('about')}>
                {searching && <h3>{t('about')}</h3>}
                <AboutModal />
              </section>
            )}
            {!showGeneral && !showCanvas && !showMeasurements && !showUpdates && !showAbout && (
              <p className={style.empty}>{t('noResults')}</p>
            )}
          </div>
          {error && (
            <p className={style.error} role="alert">
              {error}
            </p>
          )}
          <footer className={style.footer}>
            <button type="submit" disabled={saving}>
              {saving ? t('saving') : t('save')}
            </button>
            <button type="button" onClick={close} disabled={saving}>
              {t('cancel')}
            </button>
          </footer>
        </main>
      </form>
    </dialog>
  )
}
