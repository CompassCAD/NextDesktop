import React, { useMemo, useState } from 'react'
import { openModal, closeModal } from '../ModalProvider'
import { getLocaleKey } from '../../locales/Locale'
import { aciToHex } from '../../utils/dxfparse/ACadColors'
import { DxfDocument, getField } from '../../utils/dxfparse/DxfParser'
import type { DxfToCompassCadOptions } from '../../utils/dxfparse/DxfToCCAD'
import CloseIcon from '../../assets/icons/close.svg'
import OpenFolderIcon from '../../assets/icons/openLogic.svg'
import FileIcon from '../../assets/icons/ccadfile.svg'
import styles from '../../style/dxfImport.module.css'

export interface DxfImportModalProps {
  doc: DxfDocument
  fileName: string
  onConfirm: (options: DxfToCompassCadOptions) => void
  onCancel: () => void
}

interface LayerItem {
  name: string
  color: string
  count: number
}

function detectDxfUnits(insUnits: number | null): {
  unitLabel: string
  defaultPreset: string
  defaultScale: string
} {
  switch (insUnits) {
    case 1:
      return {
        unitLabel: getLocaleKey('dxfImport.unitInches'),
        defaultPreset: 'in',
        defaultScale: '2.54'
      }
    case 2:
      return {
        unitLabel: getLocaleKey('dxfImport.unitFeet'),
        defaultPreset: 'ft',
        defaultScale: '30.48'
      }
    case 4:
      return {
        unitLabel: getLocaleKey('dxfImport.unitMillimeters'),
        defaultPreset: 'mm',
        defaultScale: '0.1'
      }
    case 5:
      return {
        unitLabel: getLocaleKey('dxfImport.unitCentimeters'),
        defaultPreset: 'cm',
        defaultScale: '1'
      }
    case 6:
      return {
        unitLabel: getLocaleKey('dxfImport.unitMeters'),
        defaultPreset: 'm',
        defaultScale: '100'
      }
    default:
      return {
        unitLabel: getLocaleKey('dxfImport.unitNone'),
        defaultPreset: 'default',
        defaultScale: '10'
      }
  }
}

export default function DxfImportModal({
  doc,
  fileName,
  onConfirm,
  onCancel
}: DxfImportModalProps): React.JSX.Element {
  const detected = useMemo(() => detectDxfUnits(doc.insUnits), [doc.insUnits])

  const layers = useMemo(() => {
    const map = new Map<string, LayerItem>()

    doc.layers.forEach((layer) => {
      map.set(layer.name.toUpperCase(), {
        name: layer.name,
        color: aciToHex(layer.colorIndex),
        count: 0
      })
    })

    for (const entity of doc.entities) {
      const layerName = getField(entity, 8) ?? '0'
      const key = layerName.toUpperCase()
      let entry = map.get(key)
      if (!entry) {
        entry = { name: layerName, color: '#ffffff', count: 0 }
        map.set(key, entry)
      }
      entry.count++
    }

    if (map.size === 0) {
      map.set('0', { name: '0', color: '#ffffff', count: doc.entities.length })
    }

    return Array.from(map.values())
  }, [doc])

  const [scalePreset, setScalePreset] = useState<string>(detected.defaultPreset)
  const [scale, setScale] = useState<string>(detected.defaultScale)
  const [flipY, setFlipY] = useState<boolean>(true)
  const [groupByLayer, setGroupByLayer] = useState<boolean>(false)
  const [fillClosedPolylines, setFillClosedPolylines] = useState<boolean>(false)
  const [strokeRadius, setStrokeRadius] = useState<string>('2')
  const [textScale, setTextScale] = useState<string>('1')
  const [selectedLayers, setSelectedLayers] = useState<Set<string>>(
    () => new Set(layers.map((l) => l.name))
  )

  const handlePresetChange = (preset: string): void => {
    setScalePreset(preset)
    if (preset === 'mm') setScale('0.1')
    else if (preset === 'cm') setScale('1')
    else if (preset === 'm') setScale('100')
    else if (preset === 'in') setScale('2.54')
    else if (preset === 'ft') setScale('30.48')
    else if (preset === 'default') setScale('10')
    else if (preset === 'direct') setScale('1')
  }

  const handleScaleInput = (val: string): void => {
    setScale(val)
    const num = parseFloat(val)
    if (num === 0.1) setScalePreset('mm')
    else if (num === 1) setScalePreset('cm')
    else if (num === 100) setScalePreset('m')
    else if (num === 2.54) setScalePreset('in')
    else if (num === 30.48) setScalePreset('ft')
    else if (num === 10) setScalePreset('default')
    else setScalePreset('custom')
  }

  const toggleLayer = (layerName: string): void => {
    setSelectedLayers((prev) => {
      const next = new Set(prev)
      if (next.has(layerName)) {
        next.delete(layerName)
      } else {
        next.add(layerName)
      }
      return next
    })
  }

  const selectAllLayers = (): void => {
    setSelectedLayers(new Set(layers.map((l) => l.name)))
  }

  const deselectAllLayers = (): void => {
    setSelectedLayers(new Set())
  }

  const numScale = parseFloat(scale)
  const numStroke = parseFloat(strokeRadius)
  const numTextScale = parseFloat(textScale)

  const isScaleValid = Number.isFinite(numScale) && numScale > 0
  const isStrokeValid = Number.isFinite(numStroke) && numStroke > 0
  const isTextScaleValid = Number.isFinite(numTextScale) && numTextScale > 0
  const hasSelectedLayers = selectedLayers.size > 0

  let errorMessage: string | null = null
  if (!isScaleValid) {
    errorMessage = getLocaleKey('dxfImport.errorInvalidScale')
  } else if (!isStrokeValid) {
    errorMessage = getLocaleKey('dxfImport.errorInvalidStroke')
  } else if (!isTextScaleValid) {
    errorMessage = getLocaleKey('dxfImport.errorInvalidTextScale')
  } else if (!hasSelectedLayers) {
    errorMessage = getLocaleKey('dxfImport.errorNoLayers')
  }

  const isValid = errorMessage === null

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault()
    if (!isValid) return

    const allSelected = layers.every((l) => selectedLayers.has(l.name))
    const options: DxfToCompassCadOptions = {
      scale: numScale,
      flipY,
      groupByLayer,
      fillClosedPolylines,
      strokeRadius: numStroke,
      textScale: numTextScale,
      includeLayers: allSelected ? undefined : Array.from(selectedLayers)
    }

    onConfirm(options)
  }

  return (
    <form className={`${styles.container} dxf-scroll-managed`} onSubmit={handleSubmit}>
      <div className={styles.scrollBody}>
      <div className={styles.summaryCard}>
        <div className={styles.filenameRow}>
          <img src={FileIcon} width={24} height={24} alt="" />
          <span>{fileName}</span>
        </div>
        <div className={styles.badges}>
          <span className={styles.badge}>
            {doc.entities.length} {getLocaleKey('dxfImport.entities')}
          </span>
          <span className={styles.badge}>
            {layers.length} {getLocaleKey('dxfImport.layersCount')}
          </span>
          <span className={styles.badge}>
            {getLocaleKey('dxfImport.detectedUnits').replace('{unit}', detected.unitLabel)}
          </span>
        </div>
      </div>

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>{getLocaleKey('dxfImport.units')}</h3>
        <label className={styles.row}>
          <span>{getLocaleKey('dxfImport.scalePreset')}</span>
          <select
            value={scalePreset}
            onChange={(e) => handlePresetChange(e.target.value)}
          >
            <option value="default">{getLocaleKey('dxfImport.presetDefault')}</option>
            <option value="mm">{getLocaleKey('dxfImport.presetMm')}</option>
            <option value="cm">{getLocaleKey('dxfImport.presetCm')}</option>
            <option value="m">{getLocaleKey('dxfImport.presetM')}</option>
            <option value="in">{getLocaleKey('dxfImport.presetIn')}</option>
            <option value="direct">{getLocaleKey('dxfImport.presetDirect')}</option>
            <option value="custom">{getLocaleKey('dxfImport.presetCustom')}</option>
          </select>
        </label>
        <label className={styles.row}>
          <span>{getLocaleKey('dxfImport.scaleFactor')}</span>
          <input
            type="number"
            step="any"
            min="0.000001"
            value={scale}
            onChange={(e) => handleScaleInput(e.target.value)}
          />
        </label>
        <p className={styles.sectionHint}>{getLocaleKey('dxfImport.scaleHelp')}</p>
      </div>

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>{getLocaleKey('dxfImport.options')}</h3>
        <div className={styles.toggleRow}>
          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={flipY}
              onChange={(e) => setFlipY(e.target.checked)}
            />
            <span>{getLocaleKey('dxfImport.flipY')}</span>
          </label>
          <span className={styles.hint}>{getLocaleKey('dxfImport.flipYHelp')}</span>
        </div>

        <div className={styles.toggleRow}>
          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={groupByLayer}
              onChange={(e) => setGroupByLayer(e.target.checked)}
            />
            <span>{getLocaleKey('dxfImport.groupByLayer')}</span>
          </label>
          <span className={styles.hint}>{getLocaleKey('dxfImport.groupByLayerHelp')}</span>
        </div>

        <div className={styles.toggleRow}>
          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={fillClosedPolylines}
              onChange={(e) => setFillClosedPolylines(e.target.checked)}
            />
            <span>{getLocaleKey('dxfImport.fillClosedPolylines')}</span>
          </label>
        </div>

        <label className={styles.row}>
          <span>{getLocaleKey('dxfImport.strokeRadius')}</span>
          <input
            type="number"
            value={strokeRadius}
            onChange={(e) => setStrokeRadius(e.target.value)}
          />
        </label>

        <label className={styles.row}>
          <span>{getLocaleKey('dxfImport.textScale')}</span>
          <input
            type="number"
            value={textScale}
            onChange={(e) => setTextScale(e.target.value)}
          />
        </label>
      </div>

      <div className={styles.section}>
        <div className={styles.layerHeader}>
          <h3 className={styles.sectionTitle}>
            {getLocaleKey('dxfImport.layers')}
          </h3>
          <div className={styles.layerControls}>
            <button
              type="button"
              className={styles.toolbarBtn}
              onClick={selectAllLayers}
            >
              {getLocaleKey('dxfImport.selectAll')}
            </button>
            <button
              type="button"
              className={styles.toolbarBtn}
              onClick={deselectAllLayers}
            >
              {getLocaleKey('dxfImport.deselectAll')}
            </button>
          </div>
        </div>

        <div className={styles.layerList} role="group" aria-label={getLocaleKey('dxfImport.layers')}>
          {layers.map((layer) => {
            const isChecked = selectedLayers.has(layer.name)
            return (
              <label key={layer.name} className={styles.layerItem}>
                <div className={styles.layerLeft}>
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleLayer(layer.name)}
                  />
                  <span
                    className={styles.colorSwatch}
                    style={{ backgroundColor: layer.color }}
                    aria-hidden="true"
                  />
                  <span className={styles.layerName}>{layer.name}</span>
                </div>
                <span className={styles.layerCount}>
                  {layer.count} {getLocaleKey('dxfImport.entities')}
                </span>
              </label>
            )
          })}
        </div>
      </div>

      {errorMessage && (
        <p role="alert" className={styles.error}>
          {errorMessage}
        </p>
      )}
      </div>

      <footer className={styles.footer}>
        <button
          type="submit"
          className={styles.confirmButton}
          disabled={!isValid}
        >
          <img src={OpenFolderIcon} width={24} height={24} alt="" />
          {getLocaleKey('dxfImport.import')}
        </button>
        <button
          type="button"
          onClick={onCancel}
        >
          <img src={CloseIcon} width={24} height={24} alt="" />
          {getLocaleKey('dxfImport.cancel')}
        </button>
      </footer>
    </form>
  )
}

export function promptDxfImportOptions(
  doc: DxfDocument,
  fileName: string
): Promise<DxfToCompassCadOptions | null> {
  return new Promise((resolve) => {
    let settled = false

    const handleConfirm = (options: DxfToCompassCadOptions): void => {
      if (settled) return
      settled = true
      closeModal()
      resolve(options)
    }

    const handleCancel = (): void => {
      if (settled) return
      settled = true
      closeModal()
      resolve(null)
    }

    openModal(
      getLocaleKey('dxfImport.title'),
      <DxfImportModal
        doc={doc}
        fileName={fileName}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />,
      () => {
        if (!settled) {
          settled = true
          resolve(null)
        }
      }
    )
  })
}
