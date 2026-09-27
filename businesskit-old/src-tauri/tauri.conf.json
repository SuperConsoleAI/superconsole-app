{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "BusinessKit",
  "version": "0.0.20",
  "identifier": "io.businesskit.desktop",
  "build": {
    "frontendDist": "../dist",
    "devUrl": "http://localhost:5173",
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build"
  },
  "plugins": {
    "deep-link": {
      "desktop": {
        "schemes": ["businesskit"]
      }
    },
    "updater": {
      "endpoints": [
        "https://github.com/businesskitai/businesskit/releases/latest/download/latest.json"
      ],
      "pubkey": "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDM5NkQ5RTlDMzA0NUY0MTQKUldRVTlFVXduSjV0T2FxcUFTcEdQQXBXcFF4ZTd5Z2hwTVZCN1FLWG1HTFBJUk9jTk9XRnJCZysK"
    }
  },
  "app": {
    "windows": [
      {
        "title": "BusinessKit",
        "width": 1280,
        "height": 800,
        "minWidth": 360,
        "minHeight": 400,
        "resizable": true,
        "fullscreen": false,
        "center": true,
        "decorations": true,
        "titleBarStyle": "Overlay",
        "hiddenTitle": true
      }
    ],
    "security": {
      "csp": null,
      "assetProtocol": {
        "enable": true,
        "scope": [
          "**"
        ]
      }
    }
  },
  "bundle": {
    "createUpdaterArtifacts": true,
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ],
    "android": {
      "debugApplicationIdSuffix": ".debug"
    },
    "iOS": {},
    "macOS": {
      "entitlements": "./entitlements.mac.plist",
      "exceptionDomain": "",
      "frameworks": [],
      "minimumSystemVersion": "10.15",
      "dmg": {
        "appPosition": {
          "x": 180,
          "y": 170
        },
        "applicationFolderPosition": {
          "x": 480,
          "y": 170
        },
        "windowSize": {
          "width": 660,
          "height": 400
        }
      }
    },
    "windows": {
      "certificateThumbprint": null,
      "digestAlgorithm": "sha256",
      "timestampUrl": ""
    }
  }
}