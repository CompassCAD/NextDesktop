import { getLocaleKey } from '../../locales/Locale'
import en from '../../locales/en.json'
import CloseIcon from '../../assets/icons/close.svg'
import WebRequestIcon from '../../assets/icons/webrequest.svg'
import LocalServerIcon from '../../assets/icons/localserver.svg'
import style from '../../style/extensionPermissions.module.css'

export interface PermissionRequest {
  requestId: string
  id: string
  name: string
  permissions: string[]
}

type PermissionKey = keyof typeof en.extensions.permissions

// Map each permission key to its icon. Fall back to CloseIcon for unmapped keys.
const permissionIcons: Partial<Record<PermissionKey, string>> = {
  web_request: WebRequestIcon,
  server_listen: LocalServerIcon
}

export default function ExtensionPermissionsModal({
  request,
  onDecision
}: {
  request: PermissionRequest
  onDecision: (approved: boolean) => void
}): React.JSX.Element {
  return (
    <div className={style.content}>
      <p className={style.intro}>
        {getLocaleKey('extensions.consent').replaceAll('{name}', request.name)}
      </p>
      <span className={style.filename}>{request.id}</span>
      <ul className={style.permissions}>
        {request.permissions.map((permission) => {
          const key = permission.replaceAll('.', '_') as PermissionKey
          const icon = permissionIcons[key] ?? CloseIcon
          return (
            <li key={permission}>
              <span className={style.icon}>
                <img src={icon} alt="" width={24} height={24} />
              </span>
              <div>
                <strong>{getLocaleKey(`extensions.permissionNames.${key}`)}</strong>
                <p>{getLocaleKey(`extensions.permissions.${key}`)}</p>
              </div>
            </li>
          )
        })}
      </ul>
      <div className={style.actions}>
        <button type="button" autoFocus onClick={() => onDecision(false)}>
          {getLocaleKey('extensions.deny')}
        </button>
        <button type="button" className={style.allow} onClick={() => onDecision(true)}>
          {getLocaleKey('extensions.allow')}
        </button>
      </div>
    </div>
  )
}
