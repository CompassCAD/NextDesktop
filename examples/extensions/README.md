# Desktop Lua permissions

Copy `permissions-demo.lua` into the application's extensions folder (open it from the Extensions inspector). On activation, approve or deny the in-app permissions dialog. The sample is not installed automatically. Use a disposable absolute file path for its write/read buttons.

Declare permissions in one JSON comment before your Lua code:

```lua
-- @compasscad {"name":"My extension","permissions":["web.request"]}
```

Settings → Extensions lists every discovered `.lua` file and all declared permissions. Unknown permissions and malformed manifests block activation. Uncheck and Save to deactivate; check and Save to reactivate. Denied extensions stay inactive for the session; to retry, disable/save then enable/save. Approvals last for one activation and are requested again after restart. Legacy files without a header have canvas/UI access only.

Each extension has its own Lua state. `require('ui')` and `require('engine')` remain available without permissions. Direct JavaScript, OS libraries, file/module loaders, and debug access are unavailable. Pictures must contain embedded raster data; external image URLs cannot bypass network permissions.

Use `require('system').call(operation, arguments, callback)`. Callbacks receive `(result, error)`; error is nil on success. Calls are asynchronous and callbacks are discarded after deactivation.

| Operation | Permission | Arguments / result |
| --- | --- | --- |
| `web.request` | `web.request` | `{url, method='GET', headers={}, body?}` → `{status, headers, body}` |
| `server.start` | `server.listen` | `{port=0, body}` → `{id, url}`; serves the supplied text for requests on loopback only |
| `server.stop` | `server.listen` | `{id}` → true; only this extension's servers |
| `filesystem.read` | `filesystem.read` | `{path}` → UTF-8 text |
| `filesystem.list` | `filesystem.read` | `{path}` → array of filenames |
| `filesystem.write` | `filesystem.write` | `{path, data}` → true; creates or overwrites |
| `filesystem.mkdir` | `filesystem.write` | `{path}` → true; creates parent folders |
| `filesystem.remove` | `filesystem.write` | `{path}` → true; deletes one file, never recursively |

Filesystem grants cover all absolute paths accessible to the user's account. Network grants cover Internet and local network HTTP(S); redirects are rejected, requests time out after 15 seconds, and text files/request/response bodies are limited to 1 MiB. Servers are limited to four per extension, serve static text, and stop when disabled, reactivated, reloaded, or closed. No process execution API is exposed.

Run `node --test tests/extensions.test.cjs tests/settings.test.cjs`. Tests use temporary directories and loopback networking, never the user's configuration. Manually verify Deny prevents tabs from loading, Allow enables the sample, Cancel in Settings leaves it running, and uncheck/Save removes its tabs and closes its server without clearing the drawing.
