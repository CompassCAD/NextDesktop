import type { CSSProperties } from 'react'
import type { AgentCursor } from '../../../shared/Mcp'
import { agentProfiles } from '../../../shared/AgentIdentity'
import style from '../style/agentPresence.module.css'

export function AgentAvatar({ agent }: { agent: AgentCursor }): React.JSX.Element {
  const initials = agent.profile
    ? agentProfiles[agent.profile].initials
    : agent.name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((word) => Array.from(word)[0])
        .join('')
        .toUpperCase()
  return (
    <svg className={style.avatar} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <rect width="48" height="48" rx="16" fill={agent.color} />
      <text
        x="20"
        y="22"
        dominantBaseline="middle"
        textAnchor="middle"
        fill="white"
        fontSize={initials.length > 2 ? 13 : 17}
        fontWeight="700"
      >
        {initials || '?'}
      </text>
    </svg>
  )
}
export function AgentTag({ agent }: { agent: AgentCursor }): React.JSX.Element {
  return (
    <span className={style.tag} style={{ '--agent-color': agent.color } as CSSProperties}>
      <AgentAvatar agent={agent} />
      <span>{agent.name}</span>
    </span>
  )
}
