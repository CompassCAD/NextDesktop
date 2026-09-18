import type { LuaPluginHost } from './LuaBridge'
import type { LoadError } from './types'

export async function loadAllExtensions(host: LuaPluginHost): Promise<LoadError[]> {
  console.log('loading extensions')
  const paths = await window.api.getExtensionLists()
  console.log('found extensions', paths)
  const errors: LoadError[] = []

  for (const filePath of paths) {
    try {
      const source = window.api.readFile(filePath)
      host.runSource(source, filePath)
    } catch (e) {
      errors.push({ path: filePath, error: e instanceof Error ? e.message : String(e) })
    }
  }
  console.log(errors.length, 'extensions failed to load')

  return errors
}