# Google 登入設定（雲端同步）

雲端同步讓使用者用 Google 帳號登入，把卡片存到**他自己的 Google 雲端硬碟**裡一個只有 3D Cards 看得到的隱藏資料夾。卡片不會存在你的伺服器上，也不佔你的空間。

要啟用這個功能，你需要在 Google Cloud 建立兩組「用戶端 ID」：一組給網站，一組給電腦版。全部都在網頁上操作，大約 15 分鐘。

在完成之前，網站上不會出現「用 Google 同步」按鈕，其他功能都照常運作。

---

## 1. 建立專案並開啟 Google Drive API

1. 打開 https://console.cloud.google.com/ ，用你的 Google 帳號登入
2. 左上角的專案選單 → **新增專案**，名稱填 `3D Cards`，按 **建立**
3. 確認上方選的是剛建立的專案
4. 左側選單 → **API 和服務** → **程式庫**，搜尋 **Google Drive API**，按 **啟用**

## 2. 設定同意畫面（使用者登入時看到的畫面）

1. **API 和服務** → **OAuth 同意畫面**（新版介面叫 **Google Auth Platform** → **品牌宣傳**）
2. 應用程式名稱填 `3D Cards`，使用者支援電子郵件選你的信箱
3. 目標對象選 **外部**
4. 開發人員聯絡資訊填你的信箱，儲存
5. **資料存取**（或「範圍」）→ **新增或移除範圍**，勾選這三個：
   - `.../auth/drive.appdata`
   - `openid`
   - `.../auth/userinfo.email`
6. **目標對象** → 按 **發布應用程式**，讓所有人都能登入
   （這三個範圍都屬於「非機密」，不需要 Google 審核）

## 3. 網站用的用戶端 ID

1. **API 和服務** → **憑證** → **建立憑證** → **OAuth 用戶端 ID**
2. 應用程式類型選 **網頁應用程式**，名稱填 `3D Cards 網站`
3. **已授權的 JavaScript 來源** → **新增 URI**，填：
   `https://3dcards.app.dreamsworld.top`
   （換網域的話也要改這裡）
4. 按 **建立**，複製畫面上的 **用戶端 ID**（長得像 `1234567890-xxxx.apps.googleusercontent.com`）
5. 在 GitHub 打開 `public/js/config.js`，按 ✏️，把它貼進 `googleClientId: ""` 的引號裡，按 **Commit changes**

這組用戶端 ID 是公開的，放在程式碼裡沒有關係。

## 4. 電腦版登入用的設定

Google 不允許在 App 的內嵌視窗裡登入，所以電腦版按「用 Google 登入」時，會用使用者平常的瀏覽器打開網站的登入頁。頁面上會顯示和電腦版相同的確認碼，核對後再登入 Google，完成後電腦版會自動取得授權。這用的是第 3 步那一組「網站」用戶端，需要再補兩個設定：

1. Google Cloud → **Clients** → 點 **3D Cards 網站**
2. 在 **Authorized redirect URIs** 按 **Add URI**，填：
   `https://3dcards.app.dreamsworld.top/api/google/callback`
   按 **Save**
3. 同一頁右側的 **Client secrets**，複製 `GOCSPX-` 開頭的密鑰（看不到的話按 **Add secret** 新增一組）
4. Cloudflare 控制台 → **Workers & Pages** → 你的專案 → **設定** → **變數和祕密**（執行時變數與機密）→ **新增變數**：
   - 金鑰：`GOOGLE_WEB_CLIENT_SECRET`
   - 值：剛才複製的密鑰
   - 勾選 **秘密**，按 **新增變數並部署**

用戶端密鑰只放在 Cloudflare，不會出現在程式碼或 exe 裡。網站用戶端的 ID 已經寫在 `wrangler.jsonc` 的 `GOOGLE_WEB_CLIENT_ID`，換用戶端時要一起改。

---

## 完成後

- 網站首頁展廳會出現 **用 Google 同步** 按鈕
- 電腦版也會出現同一個按鈕（需要 v1.0.3 以上）
- 使用者登入後按 **立即同步**：新的或改過的卡片會上傳；雲端有、這台裝置沒有的卡片會下載；在這台裝置刪掉的卡片，下次同步時也會從雲端刪掉

如果登入時出現「這個應用程式未經驗證」或「存取遭拒」，通常是第 2 步的應用程式還在「測試中」，回去按 **發布應用程式** 即可。
