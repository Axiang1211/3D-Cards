# 在 Mac 編譯 3D Cards

這個版本供本機測試和自用。先安裝 Xcode Command Line Tools、Node.js 22 和 Rust stable。
只需要桌面版時不需要完整 Xcode。若尚未安裝 Command Line Tools：

```sh
xcode-select --install
```

在專案的 `desktop` 資料夾執行：

```sh
npm install
npm run build:mac
```

`build:mac` 會先把網站複製到 `desktop/web`，再產生 `.app`。
macOS 會自動載入 `src-tauri/tauri.macos.conf.json`，使用本地 ad-hoc 簽名，
不需要 Apple Developer ID。正式對外發布時，需要另行設定 Developer ID 與公證。

成品位於 `src-tauri/target/release/bundle/macos/3D Cards.app`。
可以直接雙擊開啟，也可以拖到「應用程式」資料夾。
在 Apple Silicon Mac 上預設產生 arm64 版本；在 Intel Mac 上預設產生 x86_64 版本。

若需要 DMG 安裝映像：

```sh
npm run build:mac:dmg
```

DMG 位於 `src-tauri/target/release/bundle/dmg/`。
修改網頁後重新執行構建命令即可，也可以用 `npm run dev` 開啟開發視窗。

## 目前限制

- 官方 Release 沒有 Mac 包時，不會彈出更新提示；在設定手動檢查更新會說明如何重新編譯。
  有 Mac 包時，更新按鈕會打開該 Release 頁面，請選擇與電腦處理器相符的版本。
  發布 ZIP 時，檔名可用 `3D-Cards-macos-arm64.zip`（或 Intel 的 `3D-Cards-macos-x64.zip`），
  讓更新檢查能辨識 Mac 安裝包。
- Finder 雙擊 `.3dcard` 檔案的匯入流程尚未適配 macOS。請在應用程式內手動匯入卡片檔。

參考：[Tauri 編譯前置需求](https://v2.tauri.app/start/prerequisites/)、
[Mac App Bundle](https://v2.tauri.app/distribute/macos-application-bundle/)、
[本地簽名](https://v2.tauri.app/distribute/sign/macos/#ad-hoc-signing)。
