import wordmarkUrl from '../../assets/branding/logo-wordmark.svg'
import NewDesignStart from './NewDesignStart'
import startStyle from '../../style/newDesign.module.css'
import { documentTitleBlockLayout } from '../../utils/DocumentFrame'
import { useEffect, useRef, useState } from 'react'
import { useRenderer } from '../RendererContextProvider'
import { getLocaleKey } from '../../locales/Locale'
import en from '../../locales/en.json'
import {
  defaultDocumentProperties,
  paperDimensions,
  paperSizes,
  validateDocumentProperties,
  worldPaperDimensions,
  type DocumentProperties
} from '../../utils/DocumentProperties'
import { formatMeasurement, measurementUnits } from '../../utils/SettingsOptions'
import { createNewFile } from '../../utils/FileImporter'
import style from '../../style/settings.module.css'
import modalStyle from '../../style/index.module.css'
import CloseIcon from '../../assets/icons/close.svg'
import DocumentIcon from '../../assets/icons/docproperties.svg'

const t = (key: keyof typeof en.documentProperties): string =>
  getLocaleKey(`documentProperties.${key}`)
type Section = 'identity' | 'paperSetup' | 'measurements'
const numericKeys = [
  'widthMm',
  'heightMm',
  'marginMm',
  'scaleNumerator',
  'scaleDenominator',
  'measurementPrecision'
] as const
type NumericKey = (typeof numericKeys)[number]

export default function DocumentPropertiesModal({
  onClose,
  creating = false
}: {
  onClose: () => void
  creating?: boolean
}): React.JSX.Element {
  const { renderer } = useRenderer()
  const dialog = useRef<HTMLDialogElement>(null)
  const [advanced, setAdvanced] = useState(false)
  const [section, setSection] = useState<Section>(creating ? 'paperSetup' : 'identity')
  const [draft, setDraft] = useState<DocumentProperties>(() =>
    structuredClone(
      !creating && renderer?.documentProperties
        ? renderer.documentProperties
        : {
            ...defaultDocumentProperties(),
            ...(creating ? { canvas: 'paper' as const } : {}),
            name: getLocaleKey('editor.sysdialogs.defaultName'),
            ...(!creating && renderer
              ? {
                  measurementUnit: renderer.unitMeasure as DocumentProperties['measurementUnit'],
                  measurementPrecision: renderer.measurementPrecision
                }
              : {})
          }
    )
  )
  const [numbers, setNumbers] = useState(
    () =>
      Object.fromEntries(numericKeys.map((k) => [k, String(draft[k])])) as Record<
        NumericKey,
        string
      >
  )
  const [error, setError] = useState('')
  const [fitPaper, setFitPaper] = useState(false)
  useEffect(() => {
    const element = dialog.current!
    element.showModal()
    return () => element.close()
  }, [])
  const candidate = {
    ...draft,
    ...Object.fromEntries(numericKeys.map((k) => [k, numbers[k].trim() ? Number(numbers[k]) : NaN]))
  }
  let valid: DocumentProperties | null = null
  try {
    valid = validateDocumentProperties(candidate)
  } catch {
    /* Keep invalid edits local. */
  }
  const dimensions = valid ? paperDimensions(valid) : null
  const world = valid ? worldPaperDimensions(valid) : null
  const titleBlock = valid?.showTitleBlock ? documentTitleBlockLayout(valid) : null
  const paperMmPerWorldUnit = valid ? (10 * valid.scaleNumerator) / valid.scaleDenominator : 1
  const update = <K extends keyof DocumentProperties>(key: K, value: DocumentProperties[K]): void =>
    setDraft({ ...draft, [key]: value })
  const numberInput = (key: NumericKey, min = 0.001, max = 1000000): React.JSX.Element => (
    <label className={style.row} key={key}>
      {t(key)}
      <input
        type="number"
        min={min}
        max={max}
        step={key === 'measurementPrecision' ? 1 : 'any'}
        required
        value={numbers[key]}
        onChange={(e) => setNumbers({ ...numbers, [key]: e.target.value })}
      />
    </label>
  )
  const apply = (event: React.FormEvent): void => {
    event.preventDefault()
    if (!valid || !renderer) {
      setError(t('invalid'))
      return
    }
    if (creating) createNewFile(renderer, valid)
    else {
      renderer.setDocumentProperties(valid)
      if (fitPaper) renderer.fitDocumentPaper()
    }
    onClose()
  }
  if (creating && !advanced)
    return (
      <dialog
        ref={dialog}
        className={`${style.dialog} ${startStyle.dialog}`}
        aria-labelledby="new-design-title"
        onCancel={(e) => {
          e.preventDefault()
          onClose()
        }}
        onKeyDown={(e) => e.stopPropagation()}
        onKeyUp={(e) => e.stopPropagation()}
      >
        <form className={`${modalStyle['modal-content']} ${startStyle.form}`} onSubmit={apply} noValidate>
          <header className={startStyle.header}>
            <div>
              <h1 id="new-design-title">{t('newDocument')}</h1>
            </div>
            <button type="button" onClick={onClose} aria-label={getLocaleKey('settings.cancel')}>
              <img src={CloseIcon} width={24} height={24} alt="" />
            </button>
          </header>
          <NewDesignStart
            draft={draft}
            width={numbers.widthMm}
            height={numbers.heightMm}
            onChange={setDraft}
            onDimensions={(width, height) =>
              setNumbers((current) => ({
                ...current,
                widthMm: width,
                heightMm: height,
                marginMm:
                  Number(width) > 0 && Number(height) > 0
                    ? String(
                        Math.min(
                          Number(current.marginMm),
                          Math.min(Number(width), Number(height)) / 10
                        )
                      )
                    : current.marginMm
              }))
            }
          />
          {error && (
            <p role="alert" className={style.error}>
              {error}
            </p>
          )}
          <footer className={startStyle.footer}>
            <button type="button" className={startStyle.advanced} onClick={() => setAdvanced(true)}>
              {t('advancedSetup')}
            </button>
            <button type="button" onClick={onClose}>
              {getLocaleKey('settings.cancel')}
            </button>
            <button type="submit">
              {t('create')}
            </button>
          </footer>
        </form>
      </dialog>
    )
  return (
    <dialog
      ref={dialog}
      className={style.dialog}
      aria-labelledby="document-properties-title"
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onKeyDown={(e) => e.stopPropagation()}
      onKeyUp={(e) => e.stopPropagation()}
    >
      <form
        className={[modalStyle['modal-content'], style.layout].join(' ')}
        onSubmit={apply}
        noValidate
      >
        <aside className={style.sidebar}>
          <h1 id="document-properties-title">{creating ? t('newDocument') : t('title')}</h1>
          {creating && (
            <button
              type="button"
              onClick={() => {
                if (dimensions)
                  setNumbers((current) => ({
                    ...current,
                    widthMm: String(dimensions.width),
                    heightMm: String(dimensions.height)
                  }))
                setAdvanced(false)
              }}
            >
              {t('backToTemplates')}
            </button>
          )}
          <nav aria-label={t('title')}>
            {(['identity', 'paperSetup', 'measurements'] as const).map((item) => (
              <button
                type="button"
                key={item}
                aria-current={section === item ? 'page' : undefined}
                onClick={() => setSection(item)}
              >
                <img src={DocumentIcon} alt="" />
                {t(item)}
              </button>
            ))}
          </nav>
        </aside>
        <main className={style.main}>
          <button
            type="button"
            className={style.close}
            onClick={onClose}
            aria-label={getLocaleKey('settings.cancel')}
          >
            <img src={CloseIcon} width={24} height={24} alt="" />
          </button>
          <h2 className={style.title}>{t(section)}</h2>
          <div className={style.content}>
            {section === 'identity' && (
              <section>
                {(['name', 'author', 'project', 'revision'] as const).map((key) => (
                  <label className={style.row} key={key}>
                    {t(key)}
                    <input
                      type="text"
                      value={draft[key]}
                      maxLength={10000}
                      onChange={(e) => update(key, e.target.value)}
                    />
                  </label>
                ))}
                <label className={style.row}>
                  {t('description')}
                  <textarea
                    rows={5}
                    value={draft.description}
                    maxLength={10000}
                    onChange={(e) => update('description', e.target.value)}
                  />
                </label>
                <p className={style.hint}>{t('nameHelp')}</p>
              </section>
            )}
            {section === 'paperSetup' && (
              <section>
                <label className={style.row}>
                  {t('canvas')}
                  <select
                    value={draft.canvas}
                    onChange={(e) =>
                      update('canvas', e.target.value as DocumentProperties['canvas'])
                    }
                  >
                    <option value="infinite">{t('infinite')}</option>
                    <option value="paper">{t('paperCanvas')}</option>
                  </select>
                </label>
                <p className={style.hint}>{t('canvasHelp')}</p>
                {draft.canvas === 'paper' && (
                  <>
                    <label className={style.row}>
                      {t('paper')}
                      <select
                        value={draft.paper}
                        onChange={(e) =>
                          update('paper', e.target.value as DocumentProperties['paper'])
                        }
                      >
                        {Object.entries(paperSizes).map(([name, size]) => (
                          <option key={name} value={name}>
                            {name} — {size[0]} × {size[1]} mm
                          </option>
                        ))}
                        <option value="custom">{t('custom')}</option>
                      </select>
                    </label>
                    <label className={style.row}>
                      {t('orientation')}
                      <select
                        value={draft.orientation}
                        onChange={(e) =>
                          update('orientation', e.target.value as DocumentProperties['orientation'])
                        }
                      >
                        <option value="portrait">{t('portrait')}</option>
                        <option value="landscape">{t('landscape')}</option>
                      </select>
                    </label>
                    {draft.paper === 'custom' && (
                      <>
                        {numberInput('widthMm')}
                        {numberInput('heightMm')}
                      </>
                    )}
                    {numberInput('marginMm', 0)}
                    <label className={style.row}>
                      {t('showTitleBlock')}
                      <input
                        type="checkbox"
                        checked={draft.showTitleBlock}
                        onChange={(e) => update('showTitleBlock', e.target.checked)}
                      />
                    </label>
                    <p className={style.hint}>{t('titleBlockHelp')}</p>
                    <label className={style.row}>
                      {t('showPaper')}
                      <input
                        type="checkbox"
                        checked={draft.showPaper}
                        onChange={(e) => update('showPaper', e.target.checked)}
                      />
                    </label>
                    {!creating && (
                      <label className={style.row}>
                        {t('fitPaper')}
                        <input
                          type="checkbox"
                          checked={fitPaper}
                          onChange={(e) => setFitPaper(e.target.checked)}
                        />
                      </label>
                    )}
                    {dimensions && world && valid && (
                      <div className={style.previewGroup}>
                        <svg
                          role="img"
                          aria-label={t('preview')}
                          viewBox={`-10 -10 ${dimensions.width + 20} ${dimensions.height + 20}`}
                          width="100%"
                          height="150"
                        >
                          <rect
                            width={dimensions.width}
                            height={dimensions.height}
                            fill="none"
                            stroke="#ffffff"
                            strokeWidth="1"
                          />
                          <rect
                            x={valid.marginMm}
                            y={valid.marginMm}
                            width={dimensions.width - valid.marginMm * 2}
                            height={dimensions.height - valid.marginMm * 2}
                            fill="none"
                            stroke="#ffffff"
                            strokeDasharray="4 4"
                          />
                          {titleBlock &&
                            <image href={wordmarkUrl}
                              x={titleBlock.wordmark.x * paperMmPerWorldUnit + dimensions.width / 2}
                              y={titleBlock.wordmark.y * paperMmPerWorldUnit + dimensions.height / 2}
                              width={titleBlock.wordmark.width * paperMmPerWorldUnit}
                              height={titleBlock.wordmark.height * paperMmPerWorldUnit}
                            />}
                          {titleBlock &&
                            titleBlock.cells.map((cell) => (
                              <rect
                                key={cell.field}
                                x={cell.x * paperMmPerWorldUnit + dimensions.width / 2}
                                y={cell.y * paperMmPerWorldUnit + dimensions.height / 2}
                                width={cell.width * paperMmPerWorldUnit}
                                height={cell.height * paperMmPerWorldUnit}
                                fill="none"
                                stroke="#ffffff"
                                strokeWidth="0.4"
                              />
                            ))}
                        </svg>
                        <p>
                          {t('physicalSize')}: {dimensions.width} × {dimensions.height} mm
                        </p>
                        <p>
                          {t('worldSize')}:{' '}
                          {formatMeasurement(
                            world.width,
                            valid.measurementUnit,
                            valid.measurementPrecision
                          )}{' '}
                          ×{' '}
                          {formatMeasurement(
                            world.height,
                            valid.measurementUnit,
                            valid.measurementPrecision
                          )}
                        </p>
                        <small>
                          {t('printableSize')}:{' '}
                          {formatMeasurement(
                            world.width - 2 * world.margin,
                            valid.measurementUnit,
                            valid.measurementPrecision
                          )}{' '}
                          ×{' '}
                          {formatMeasurement(
                            world.height - 2 * world.margin,
                            valid.measurementUnit,
                            valid.measurementPrecision
                          )}
                        </small>
                      </div>
                    )}
                  </>
                )}
              </section>
            )}
            {section === 'measurements' && (
              <section>
                <label className={style.row}>
                  {t('measurementUnit')}
                  <select
                    value={draft.measurementUnit}
                    onChange={(e) =>
                      update(
                        'measurementUnit',
                        e.target.value as DocumentProperties['measurementUnit']
                      )
                    }
                  >
                    {Object.entries(measurementUnits).map(([key, unit]) => (
                      <option key={key} value={key}>
                        {getLocaleKey(`settings.${unit.label}`)}
                      </option>
                    ))}
                  </select>
                </label>
                {numberInput('measurementPrecision', 0, 6)}
                <h3>{t('scale')}</h3>
                <label className={style.row}>
                  {t('scalePreset')}
                  <select
                    value=""
                    onChange={(e) => {
                      if (e.target.value)
                        setNumbers({
                          ...numbers,
                          scaleNumerator: '1',
                          scaleDenominator: e.target.value
                        })
                    }}
                  >
                    <option value="">{t('chooseScale')}</option>
                    {[1, 2, 5, 10, 20, 25, 50, 100, 200, 500, 1000].map((n) => (
                      <option key={n} value={n}>
                        1:{n}
                      </option>
                    ))}
                  </select>
                </label>
                {numberInput('scaleNumerator')}
                {numberInput('scaleDenominator')}
                <p className={style.hint}>{t('scaleHelp')}</p>
                <p className={style.hint}>{t('unitsHelp')}</p>
              </section>
            )}
            <p className={style.hint}>{t('storageHelp')}</p>
          </div>
          {error && (
            <p role="alert" className={style.error}>
              {error}
            </p>
          )}
          <footer className={style.footer}>
            <button type="submit">{creating ? t('create') : t('apply')}</button>
            <button type="button" onClick={onClose}>
              {getLocaleKey('settings.cancel')}
            </button>
          </footer>
        </main>
      </form>
    </dialog>
  )
}
