import { useEffect, useState } from 'react'
import { usePluginHost, PluginTabView } from './PluginRuntime'
import { loadAllExtensions } from './ExtensionLoader'
import { useRenderer } from '../components/RendererContextProvider' // <-- Import renderer state
import Collapsible from './Collapsible'
import type { LoadError } from './types'
import styles from '../style/index.module.css'
import NoPluginIcon from '../assets/icons/stroke-plugin.svg'
import { getLocaleKey } from '@renderer/locales/Locale'

function basename(path: string): string {
  const parts = path.split(/[\\/]/)
  return parts[parts.length - 1] || path
}

export default function PluginsPanel(): React.ReactElement {
  const host = usePluginHost()
  const { isReady } = useRenderer() // <-- Read renderer readiness
  const [groups, setGroups] = useState<{ group: string; tabNames: string[] }[]>([])
  const [activeTabByGroup, setActiveTabByGroup] = useState<Record<string, string>>({})
  const [loadErrors, setLoadErrors] = useState<LoadError[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    // Block extension loading until the renderer initialization is complete
    if (!isReady) return

    const unsub = host.onUpdate(() => {
      const next = host.listGroups()
      setGroups(next)
      setActiveTabByGroup((prev) => {
        const updated = { ...prev }
        for (const g of next) {
          if (!updated[g.group] || !g.tabNames.includes(updated[g.group])) {
            updated[g.group] = g.tabNames[0]
          }
        }
        return updated
      })
    })

    loadAllExtensions(host)
      .then(setLoadErrors)
      .finally(() => setLoaded(true))

    return unsub
  }, [host, isReady]) // <-- Re-run when renderer isReady changes

  if (!isReady || !loaded)
    return (
      <div className={styles['properties-nothing']} style={{ flex: 1 }}>
        <img src={NoPluginIcon} width={56} alt="Unselected" />
        <p>{getLocaleKey('editor.inspector.properties.extensionLoading')}</p>
      </div>
    )

  return (
    <div className={styles['plugin-container-button-group']}>
      {loadErrors.length > 0 && (
        <div style={{ color: 'var(--error, red)', fontSize: 12 }}>
          {loadErrors.map((e) => (
            <div key={e.path}>
              {e.path}: {e.error}
            </div>
          ))}
        </div>
      )}

      {groups.length === 0 ? (
        <div className={styles['properties-nothing']} style={{ flex: 1 }}>
          <img src={NoPluginIcon} width={56} alt="Unselected" />
          <p>{getLocaleKey('editor.inspector.properties.noPluginsLoaded')}</p>
          <button
            style={{ marginTop: '10px' }}
            onClick={() =>
              window.api.openExternal(window.api.joinPathToRelativeAppPath('extensions'))
            }
          >
            {getLocaleKey('editor.inspector.properties.openPluginsFolder')}
          </button>
        </div>
      ) : (
        groups.map((g) => (
          <Collapsible key={g.group} title={basename(g.group)}>
            {g.tabNames.length > 1 && (
              <div>
                {g.tabNames.map((name) => (
                  <button
                    key={name}
                    onClick={() => setActiveTabByGroup((prev) => ({ ...prev, [g.group]: name }))}
                    style={{ fontWeight: activeTabByGroup[g.group] === name ? 'bold' : 'normal' }}
                  >
                    {name}
                  </button>
                ))}
              </div>
            )}
            {activeTabByGroup[g.group] && (
              <PluginTabView host={host} tabName={activeTabByGroup[g.group]} />
            )}
          </Collapsible>
        ))
      )}
    </div>
  )
}
