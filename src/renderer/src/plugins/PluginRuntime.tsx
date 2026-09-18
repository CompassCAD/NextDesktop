import { useEffect, useState } from 'react'
import { LuaPluginHost } from './LuaBridge'
import { renderLuaNode } from './LuaToReact'

/** One host per mount of the Plugins tab; disposed on unmount. */
export function usePluginHost(): LuaPluginHost {
  const [host] = useState(() => new LuaPluginHost())
  useEffect(() => () => host.dispose(), [host])
  return host
}

export function PluginTabView({
  host,
  tabName
}: {
  host: LuaPluginHost
  tabName: string
}): React.ReactElement {
  const [, forceTick] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => host.onUpdate(() => forceTick((n) => n + 1)), [host])

  let tree: unknown = null
  try {
    tree = host.renderTab(tabName)
  } catch (e) {
    if (error !== (e instanceof Error ? e.message : String(e))) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  if (error) return <p style={{ color: 'var(--error, red)' }}>{error}</p>
  if (!tree) return <p>Plugin tab not found: {tabName}</p>
  return <>{renderLuaNode(tree)}</>
}