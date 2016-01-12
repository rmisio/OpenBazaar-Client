"use strict";

// Check that the deps in node_modules match what's in package.json.
var safestart = require('safestart');
safestart(__dirname);

var fs = require('fs');
var path = require('path');

var app = require('app');  // Module to control application life.
var BrowserWindow = require('electron').BrowserWindow;  // Module to create native browser window.
var request = require('request');
var os = require('os');
var autoUpdater = require('auto-updater');
var electron = require('electron');
var menu = require('menu');
var tray = require('tray');

var launched_from_installer = false;
var platform = os.platform() + '_' + os.arch();
switch(platform) {
  case "darwin_x64":
    platform = "mac";
}
var version = app.getVersion();
var trayMenu = null;
var subpy = null;

var open_url = null; // This is for if someone opens a URL before the client is open

var start_local_server = function() {
  var platform = process.platform;

  if(platform == "darwin" || platform == "linux") {
    subpy = require('child_process').spawn('./openbazaard', ['start', '--testnet', '--loglevel', 'debug'], {
      detach: true,
      cwd: __dirname + '/OpenBazaar-Server'
    });
    var stdout = '';
    var stderr = '';

    subpy.stdout.on('data', function (buf) {
      console.log('[STR] stdout "%s"', String(buf));
      stdout += buf;
    });
    subpy.stderr.on('data', function (buf) {
      console.log('[STR] stderr "%s"', String(buf));
      stderr += buf;
    });
    subpy.on('error', function(err) {
      console.log('Python error %s', String(err));
    });
    subpy.on('close', function (code) {
      console.log('exited with ' + code);
      console.log('[END] stdout "%s"', stdout);
      console.log('[END] stderr "%s"', stderr);
    });
    subpy.unref();
  }
};

// Check if we need to kick off the python server-daemon (Desktop app)
if(fs.existsSync(__dirname + path.sep + "OpenBazaar-Server")) {
  launched_from_installer = true;

  console.log('Starting OpenBazaar Server');
  start_local_server();
}

// Report crashes to our server.
//require('crash-reporter').start();

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is GCed.
var mainWindow = null;

// Quit when all windows are closed.
app.on('window-all-closed', function() {
  // On OS X it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform != 'darwin') {
    app.quit();
  }
});

// You can use 'before-quit' instead of (or with) the close event
app.on('before-quit', function (e) {
    // Handle menu-item or keyboard shortcut quit here
    console.log('Closing Application');
    if(launched_from_installer) {
      console.log('Shutting down server daemon');
      request('http://localhost:18469/api/v1/shutdown', function (error, response, body) {
        if (!error && response.statusCode == 200) {
          console.log('Shutting down server');
        } else {
          console.log('Server does not seem to be running.');
        }
      });
    }
});

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.on('ready', function() {

  //var protocol = require('protocol');
  //protocol.registerBufferProtocol('ob', function(request, callback) {
  //  var url = request.url.substr(5);
  //  console.log(path.normalize(__dirname + '/' + url));
  //  callback({mimeType: 'text/html', data: new Buffer('<h5>Response</h5>')});
  //}, function (error) {
  //  if (error) {
  //    console.error('Failed to register protocol');
  //    console.error(error);
  //  }
  //});

  // Application Menu
  var appMenu = menu.buildFromTemplate([
    {
      label: 'OpenBazaar',
      submenu: [
        {
          label: 'Quit OpenBazaar',
          accelerator: 'CmdOrCtrl+Q',
          click: function() {
            app.quit();
          }
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { label: "Undo", accelerator: "CmdOrCtrl+Z", selector: "undo:" },
        { label: "Redo", accelerator: "Shift+CmdOrCtrl+Z", selector: "redo:" },
        { type: "separator" },
        { label: "Cut", accelerator: "CmdOrCtrl+X", selector: "cut:" },
        { label: "Copy", accelerator: "CmdOrCtrl+C", selector: "copy:" },
        { label: "Paste", accelerator: "CmdOrCtrl+V", selector: "paste:" },
        { label: "Select All", accelerator: "CmdOrCtrl+A", selector: "selectAll:" }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Reload',
          accelerator: 'CmdOrCtrl+R',
          click: function(item, focusedWindow) {
            if (focusedWindow) {
              focusedWindow.reload();
            }
          }
        },
        {
          label: 'Toggle Developer Tools',
          accelerator: (function() {
            if (process.platform == 'darwin') {
              return 'Alt+Command+I';
            } else {
              return 'Ctrl+Shift+I';
            }
          })(),
          click: function(item, focusedWindow) {
            if (focusedWindow) {
              focusedWindow.toggleDevTools();
            }
          }
        },
      ]
    }
  ]);
  menu.setApplicationMenu(appMenu);

  trayMenu = new tray(__dirname + '/imgs/menubar_icon.png');
  var contextMenu = menu.buildFromTemplate([
    {
      label: 'Start Local Server', type: 'normal', click: function () {
      start_local_server();
    }
    },
    {
      label: 'Shutdown Local Server', type: 'normal', click: function () {
      request('http://localhost:18469/api/v1/shutdown', function (error, response, body) {
        if (!error && response.statusCode == 200) {
          console.log('Shutting down server');
        } else {
          console.log('Server does not seem to be running.');
        }
      });
    }
    },
    {type: 'separator'},
    {label: 'View Debug Log', type: 'normal', click: function() {
      // Open Debug Log Wherever It Is

    }},
    {type: 'separator'},
    {
      label: 'Quit', type: 'normal', accelerator: 'Command+Q', click: function () {
      app.quit();
    }
    }
  ]);

  trayMenu.setContextMenu(contextMenu);

  // Create the browser window.
  mainWindow = new BrowserWindow({
    "width": 1200,
    "height": 720,
    "min-width": 1024,
    "min-height": 700,
    "center": true,
    "title": "OpenBazaar",
    "frame": false,
    "icon": "imgs/openbazaar-icon.png",
    "title-bar-style": "hidden"
  });

  // and load the index.html of the app.
  if(open_url) {
    mainWindow.loadURL('file://' + __dirname + '/index.html' + open_url);
  } else {
    mainWindow.loadURL('file://' + __dirname + '/index.html');
  }

  // Open the devtools.
  mainWindow.openDevTools({detach: true});

  // Emitted when the window is closed.
  mainWindow.on('closed', function() {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    mainWindow = null;

    if(subpy) {
      subpy.kill('SIGHUP');
    }
  });

  app.on('activate-with-no-open-windows', function() {
    mainWindow.show();
  });

  autoUpdater.on("error", function(err, msg) {
    mainWindow.webContents.executeJavaScript("console.log('Error with Update: " + msg + "');");
  });

  autoUpdater.on("update-not-available", function(msg) {
    // Nothing to do here
  });

  autoUpdater.on("update-available", function() {
    mainWindow.webContents.executeJavaScript("console.log('Update available! Downloading now...')");
  });

  autoUpdater.on("update-downloaded", function(e, releaseNotes, releaseName, releaseDate, updateUrl, quitAndUpdate) {
    mainWindow.webContents.executeJavaScript("console.log('Update downloaded." + updateUrl + "')");
    // Now do the stuff you need to do.
    //if(platform == "darwin") {
      // Unzip and replace the application
      autoUpdater.quitAndInstall();
    //}
  });

  autoUpdater.setFeedUrl('http://updates.openbazaar.org:5000/update/' + platform + '/' + version);
  autoUpdater.checkForUpdates();

});

app.on('open-url', function(event, uri) {

  // uri should be in format ob:route delimited by colons
  // eg: ob:user:GUID
  //     ob:user:GUID:store
  //     ob:user:GUID:item:ITEM_ID
  var split_uri = uri.split(':');
  if(split_uri.length > 1 && split_uri[0] == "ob") {
    switch(split_uri[1]) {
      case "user":
        open_url = "#userPage/" + split_uri[2];
        if(split_uri[3] == "store") {
          open_url += "/store";
        } else if(split_uri[3] == "item") {
          open_url += "/item" + split_uri[4];
        }

        break;
    }
  }
  console.log(open_url);

  // If application was not open store in localStorage
  if(mainWindow) {
    mainWindow.webContents.executeJavaScript("Backbone.history.navigate('" + open_url + "', {trigger: true});");
  }

  event.preventDefault();
});