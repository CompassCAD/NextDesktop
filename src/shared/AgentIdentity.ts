export const agentProfiles = {
  claude: { name: 'Claude', color: '#D97757', initials: 'Cl' },
  chatgpt: { name: 'ChatGPT', color: '#10A37F', initials: 'GPT' },
  codex: { name: 'Codex', color: '#64748B', initials: 'Cx' },
  gemini: { name: 'Gemini', color: '#4285F4', initials: 'Ge' },
  copilot: { name: 'Copilot', color: '#8B5CF6', initials: 'Co' },
  cursor: { name: 'Cursor', color: '#0891B2', initials: 'Cu' }
} as const
export type AgentProfile = keyof typeof agentProfiles

/** Presentation hints from clientInfo, not authenticated identity. */
export function resolveAgentIdentity(
  clientName: string,
  fallbackColor: string
): {
  name: string
  color: string
  profile?: AgentProfile
} {
  const normalized = clientName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
  const words = normalized.split(' ')
  const profile =
    (Object.keys(agentProfiles) as AgentProfile[]).find((key) => words.includes(key)) ??
    (words.includes('chat') && words.includes('gpt') ? 'chatgpt' : undefined)
  return profile
    ? { ...agentProfiles[profile], profile }
    : {
        name: clientName.trim().slice(0, 80) || 'Guest',
        color: fallbackColor
      }
}
