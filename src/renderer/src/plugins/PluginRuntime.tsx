import { useEffect, useState } from 'react'
import { LuaPluginHost } from './LuaBridge'
import { renderLuaNode } from './LuaToReact'

// Shared Lua host for the whole app. Creating one host instance avoids
// multiple hosts being created in different component trees which can
// lead to the renderer being set on a different host than the one used
// to load/run extensions (a race condition causing "no renderer is
// connected" errors). Keep the host alive for the app lifetime.
let sharedHost: LuaPluginHost | null = null

export function usePluginHost(): LuaPluginHost {
  const [host] = useState(() => {
    if (!sharedHost) sharedHost = new LuaPluginHost()
    return sharedHost
  })
  // Do not dispose the shared host on unmount — it is intentionally
  // long-lived for the lifetime of the application to avoid races.
  useEffect(() => undefined, [host])
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