import { useEffect, useState } from 'react'
import { usePluginHost, PluginTabView } from './PluginRuntime'
import { loadAllExtensions } from './ExtensionLoader'
import Collapsible from './Collapsible'
import type { LoadError } from './types'

function basename(path: string): string {
  const parts = path.split(/[\\/]/)
  return parts[parts.length - 1] || path
}

export default function PluginsPanel(): React.ReactElement {
  const host = usePluginHost()
  const [groups, setGroups] = useState<{ group: string; tabNames: string[] }[]>([])
  const [activeTabByGroup, setActiveTabByGroup] = useState<Record<string, string>>({})
  const [loadErrors, setLoadErrors] = useState<LoadError[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
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
    loadAllExtensions(host).then(setLoadErrors).finally(() => setLoaded(true))
    return unsub
  }, [host])

  if (!loaded) return <p>Loading extensions…</p>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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
        <p>No plugin tabs registered.</p>
      ) : (
        groups.map((g, i) => (
          <Collapsible key={g.group} title={basename(g.group)} defaultOpen={i === 0}>
            {g.tabNames.length > 1 && (
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
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
            {activeTabByGroup[g.group] && <PluginTabView host={host} tabName={activeTabByGroup[g.group]} />}
          </Collapsible>
        ))
      )}
    </div>
  )
}