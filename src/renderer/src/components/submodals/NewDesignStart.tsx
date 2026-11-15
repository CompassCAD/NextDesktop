import type { DocumentProperties } from '../../utils/DocumentProperties'
import { paperSizes } from '../../utils/DocumentProperties'
import { getLocaleKey } from '../../locales/Locale'
import en from '../../locales/en.json'
import style from '../../style/newDesign.module.css'

const t = (key: keyof typeof en.documentProperties): string =>
  getLocaleKey(`documentProperties.${key}`)
const templates = ['infinite', 'A4', 'A3', 'A6', 'Letter', 'custom'] as const
export default function NewDesignStart({
  draft,
  width,
  height,
  onChange,
  onDimensions
}: {
  draft: DocumentProperties
  width: string
  height: string
  onChange: (draft: DocumentProperties) => void
  onDimensions: (width: string, height: string) => void
}): React.JSX.Element {
  const selected = draft.canvas === 'infinite' ? 'infinite' : draft.paper
  const choose = (value: string): void => {
    if (value === 'infinite') {
      onDimensions('210', '297')
      onChange({ ...draft, canvas: 'infinite', paper: 'A4', orientation: 'portrait' })
      return
    }
    if (value === 'custom') {
      onChange({ ...draft, canvas: 'paper', paper: 'custom' })
      return
    }
    const paper = value as keyof typeof paperSizes
    const [w, h] = paperSizes[paper]
    onDimensions(String(w), String(h))
    onChange({ ...draft, canvas: 'paper', paper, orientation: 'portrait' })
  }
  const resize = (w: string, h: string): void => {
    onDimensions(w, h)
    onChange({
      ...draft,
      canvas: 'paper',
      paper: 'custom',
      orientation: Number(w) > Number(h) ? 'landscape' : 'portrait'
    })
  }
  return (
    <div className={style.body}>
      <section className={style.templates} aria-label={t('chooseTemplate')}>
        <h2>{t('chooseTemplate')}</h2>
        <div className={style.cards}>
          {templates.map((template) => (
            <button
              type="button"
              key={template}
              className={style.card}
              aria-pressed={selected === template}
              onClick={() => choose(template)}
            >
              <span className={style.thumbnail} aria-hidden="true">
                {template === 'infinite' ? (
                  <span className={style.infinity}>∞</span>
                ) : (
                  <svg viewBox="0 0 100 80">
                    <rect x="28" y="8" width="44" height="62" rx="1" />
                    <path d="M32 12H68V66H32ZM32 54H59V66M32 60H59M45 60V66" />
                    {template === 'custom' && (
                      <path d="M17 8V70M14 11L17 8L20 11M14 67L17 70L20 67M28 76H72" />
                    )}
                  </svg>
                )}
              </span>
              <span className={style.cardTitle}>
                {template === 'infinite'
                  ? t('infinite')
                  : template === 'custom'
                    ? t('custom')
                    : template}
              </span>
              <span className={style.cardCaption}>
                {template === 'infinite'
                  ? t('unlimitedSpace')
                  : template === 'custom'
                    ? t('yourDimensions')
                    : `${paperSizes[template][0]} × ${paperSizes[template][1]} mm`}
              </span>
            </button>
          ))}
        </div>
        <label className={style.more}>
          {t('morePaperSizes')}
          <select value={selected} onChange={(e) => choose(e.target.value)}>
            <option value="infinite">{t('infinite')}</option>
            {Object.entries(paperSizes).map(([key, size]) => (
              <option key={key} value={key}>
                {key} · {size[0]} × {size[1]} mm
              </option>
            ))}
            <option value="custom">{t('custom')}</option>
          </select>
        </label>
      </section>
      <section className={style.details} aria-label={t('designSetup')}>
        <h2>{t('designSetup')}</h2>
        <label className={style.field}>
          {t('name')}
          <input
            type="text"
            value={draft.name}
            maxLength={10000}
            onChange={(e) => onChange({ ...draft, name: e.target.value })}
            autoFocus
          />
        </label>
        <label className={style.field}>
          {t('author')}
          <input
            type="text"
            value={draft.author}
            maxLength={10000}
            placeholder={t('optional')}
            onChange={(e) => onChange({ ...draft, author: e.target.value })}
          />
        </label>
        <div className={style.dimensions}>
          <label className={style.field}>
            {t('startWidth')}
            <input
              type="number"
              min="0.001"
              max="1000000"
              step="any"
              value={width}
              onChange={(e) => resize(e.target.value, height)}
            />
          </label>
          <span aria-hidden="true">×</span>
          <label className={style.field}>
            {t('startHeight')}
            <input
              type="number"
              min="0.001"
              max="1000000"
              step="any"
              value={height}
              onChange={(e) => resize(width, e.target.value)}
            />
          </label>
        </div>
        <p className={style.hint}>
          {draft.canvas === 'infinite' ? t('infiniteDimensionHelp') : t('customDimensionHelp')}
        </p>
        {draft.canvas === 'paper' && (
          <>
            <div className={style.orientation} role="group" aria-label={t('orientation')}>
              {(['portrait', 'landscape'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={draft.orientation === value}
                  onClick={() => {
                    onDimensions(
                      String(
                        value === 'portrait'
                          ? Math.min(Number(width), Number(height))
                          : Math.max(Number(width), Number(height))
                      ),
                      String(
                        value === 'portrait'
                          ? Math.max(Number(width), Number(height))
                          : Math.min(Number(width), Number(height))
                      )
                    )
                    onChange({ ...draft, orientation: value })
                  }}
                >
                  {t(value)}
                </button>
              ))}
            </div>
            <label className={style.toggle}>
              <input
                type="checkbox"
                checked={draft.showTitleBlock}
                onChange={(e) => onChange({ ...draft, showTitleBlock: e.target.checked })}
              />
              {t('includeTitleBlock')}
            </label>
          </>
        )}
      </section>
    </div>
  )
}
