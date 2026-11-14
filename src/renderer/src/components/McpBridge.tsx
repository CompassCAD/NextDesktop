import { isMcpEditTool } from '../../../shared/Mcp'
import { useEffect } from 'react'
import { useRenderer } from './RendererContextProvider'
import { createMcpPlayback } from '../engine/McpPlayback'
import { settingsStorage } from '../utils/SettingsStorage'

export default function McpBridge(): null {
  const { renderer } = useRenderer()
  useEffect(() => {
    if (!renderer) return
    const playback = createMcpPlayback(renderer, (request) => {
      if (settingsStorage.getItem('mcpEnabled') !== 'true') throw new Error('MCP is disabled.')
      if (isMcpEditTool(request.tool) && settingsStorage.getItem('mcpAllowEdits') === 'false')
        throw new Error('MCP editing is disabled.')
    })
    const offRequests = window.api.onMcpRequest((request) => {
      void playback.execute(request).then(
        (result) => window.api.mcpReply(request.id, { result }),
        (error) => window.api.mcpReply(request.id, { error: String(error) })
      )
    })
    const offAgents = window.api.onMcpAgents((agents) => {
      // Server snapshots manage membership; renderer owns animated positions.
      renderer.mcpAgents = agents.map((agent) => {
        const current = renderer.mcpAgents.find((item) => item.id === agent.id)
        return current ? { ...agent, x: current.x, y: current.y, color: current.color } : agent
      })
      renderer.markDirty('MCP presence')
      renderer.update()
    })
    void window.api.mcpReady(true).catch(console.error)
    return () => {
      playback.dispose()
      offRequests()
      offAgents()
      renderer.mcpAgents = []
      renderer.markDirty('MCP disconnected')
      renderer.update()
      void window.api.mcpReady(false).catch(console.error)
    }
  }, [renderer])
  return null
}
