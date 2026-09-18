export type LuaNodeKind = 'Column' | 'Row' | 'Text' | 'Button' | 'Input' | 'Checkbox'
 
export interface LuaNode {
  type: LuaNodeKind
  props: Record<string, any>
  children: LuaNode[] | Record<string, LuaNode>
}
 
export interface LoadError {
  path: string
  error: string
}