import { useEffect, useRef, useState } from 'react'
import { Line } from '../engine/Component'
import Types from '../engine/Types'
import { getLocaleKey } from '../locales/Locale'
import styles from '../style/workflow.module.css'
import { saveFile } from '../utils/FileImporter'
import GuideBorder from './GuideBorder'
import { useRenderer } from './RendererContextProvider'
import Toolbar from './Toolbar'
import { toast } from './Toast'

const modes = Types.NavigationTypes
const lessons = [
  { mode: modes.AddLine, tool: 'editor.toolbox.addLine', action: 'line', hint: 'workflow.guideDraw' },
  { mode: modes.Select, tool: 'editor.toolbox.select', action: 'select', hint: 'workflow.trySelect' },
  { mode: modes.Navigate, tool: 'editor.toolbox.navigate', action: 'pan', hint: 'workflow.tryPan' },
  { mode: modes.Delete, tool: 'editor.toolbox.delete', action: 'delete', hint: 'workflow.tryDelete' },
  { mode: modes.AddLine, tool: 'editor.toolbox.addLine', action: 'line', hint: 'workflow.drawToKeep' }
] as const

export default function DrawingTour({ open, onEnd }: {
  open: boolean
  onEnd: (open: false) => void
}): React.ReactElement {
  const { renderer } = useRenderer()
  const [index, setIndex] = useState(0)
  const [usingTool, setUsingTool] = useState(false)
  const lesson = lessons[index]
  const practiceLine = useRef<Line | null>(null)
  const marker = useRef<HTMLDivElement>(null)
  const targetLine = usingTool && (lesson?.action === 'select' || lesson?.action === 'delete')

  useEffect(() => {
    if (!open || !renderer) return
    const end = (): void => onEnd(false)
    const saved = (): void => {
      if (!lesson) {
        end()
        void toast(getLocaleKey('workflow.finish'))
      }
    }
    renderer.canDeleteWithTool = target => lesson?.action === 'delete' && target === practiceLine.current
    renderer.onToolAction = (action, target) => {
      if (!lesson) return
      if (action === 'mode') {
        setUsingTool(renderer.mode === lesson.mode)
        return
      }
      if (!usingTool || renderer.mode !== lesson.mode || action !== lesson.action) return
      if (action === 'line' && index === 0 && target instanceof Line) practiceLine.current = target
      if ((action === 'select' || action === 'delete') && target !== practiceLine.current) return
      if (action === 'delete') practiceLine.current = null
      setUsingTool(false)
      setIndex(index + 1)
      // End chained line drawing and leave Delete mode once the exercise is done.
      if (action === 'line' || action === 'delete') renderer.setMode(modes.Select)
    }
    window.addEventListener('drawing-replaced', end)
    window.addEventListener('drawing-saved', saved)
    return () => {
      renderer.canDeleteWithTool = undefined
      renderer.onToolAction = undefined
      window.removeEventListener('drawing-replaced', end)
      window.removeEventListener('drawing-saved', saved)
    }
  }, [open, renderer, index, usingTool, lesson, onEnd])

  useEffect(() => {
    if (!open || !renderer || !practiceLine.current) return
    const line = practiceLine.current
    let lineIndex = renderer.logicDisplay?.components.indexOf(line) ?? -1
    let frame: number
    const update = (): void => {
      // Undo and document edits can remove or replace the practice geometry.
      const components = renderer.logicDisplay?.components
      if (components?.[lineIndex] !== line) lineIndex = components?.indexOf(line) ?? -1
      if (lineIndex < 0) {
        if (practiceLine.current === line) {
          practiceLine.current = null
          setUsingTool(false)
          setIndex(0)
        }
        return
      }
      if (marker.current && renderer.displayRef) {
        const rect = renderer.displayRef.getBoundingClientRect()
        const x = rect.left + rect.width / 2 + (line.x1 + renderer.cOutX) * renderer.zoom
        const y = rect.top + rect.height / 2 + (line.y1 + renderer.cOutY) * renderer.zoom
        marker.current.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`
      }
      frame = requestAnimationFrame(update)
    }
    update()
    return () => cancelAnimationFrame(frame)
  }, [open, renderer, index, targetLine])

  return <>
    <Toolbar highlightedMode={open && !usingTool ? lesson?.mode : undefined} />
    {open && renderer && <>
      {targetLine && <div ref={marker} className={styles.endpoint}><GuideBorder /></div>}
      {lesson && usingTool && !targetLine && <div className={styles.canvasBorder}><GuideBorder /></div>}
      <aside className={styles.guide}>
        <div role="status" aria-live="polite">
          <small>{getLocaleKey('workflow.stepCount').replace('{step}', String(index + 1)).replace('{total}', String(lessons.length + 1))}</small>
          <p>{!lesson ? getLocaleKey('workflow.guideSave') : usingTool ? getLocaleKey(lesson.hint) :
            getLocaleKey('workflow.chooseTool').replace('{tool}', getLocaleKey(lesson.tool))}</p>
        </div>
        {!lesson && <button onClick={() => void saveFile(renderer)}>{getLocaleKey('workflow.save')}<GuideBorder /></button>}
        <button onClick={() => {
          renderer.setMode(modes.Select)
          onEnd(false)
        }}>{getLocaleKey('workflow.cancel')}</button>
      </aside>
    </>}
  </>
}
