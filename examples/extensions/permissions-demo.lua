-- @compasscad {"name":"Permissions demo","permissions":["web.request","server.listen","filesystem.read","filesystem.write"]}
local UI = require('ui')
local system = require('system')
local engine = require('engine')

UI.registerTab('Permissions demo', function()
  local status, setStatus = UI.useState('Choose an action below.')
  local file, setFile = UI.useState('')
  local server, setServer = UI.useState(nil)
  local function result(value, err)
    setStatus(err or tostring(value))
  end
  return UI.Column({
    UI.Text({value = status}),
    UI.Button({label = 'Start local server and test WebRequest', onClick = function()
      if server then setStatus('Stop the existing server first.'); return end
      system.call('server.start', {port = 0, body = 'Hello from CompassCAD Lua!'}, function(value, err)
        if err then setStatus(err); return end
        setServer(value.id)
        system.call('web.request', {url = value.url}, function(response, requestError)
          setStatus(requestError or (value.url .. ' returned: ' .. response.body))
        end)
      end)
    end}),
    UI.Button({label = 'Stop server', onClick = function()
      if server then
        system.call('server.stop', {id = server}, function(value, err)
          if not err then setServer(nil) end
          result(value, err)
        end)
      end
    end}),
    UI.Input({value = file, placeholder = 'Absolute path to a disposable text file', onChange = setFile}),
    UI.Button({label = 'Write demo text (overwrites this file)', onClick = function()
      system.call('filesystem.write', {path = file, data = 'Written by the Lua permissions demo.'}, result)
    end}),
    UI.Button({label = 'Read text file', onClick = function()
      system.call('filesystem.read', {path = file}, result)
    end}),
    UI.Button({label = 'Draw a line (no OS permission needed)', onClick = function()
      engine.line(0, 0, 10, 10)
      setStatus('Line added to canvas.')
    end})
  })
end)
