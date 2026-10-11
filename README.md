# 3D Card

把照片做成會反光的 3D 鐳射卡片。上傳一張照片，選一種鐳射，卡片就會跟著滑鼠的位置或手機的角度傾斜，光澤隨著視角流過整張卡片。

- **首頁展廳**：一張可以直接把玩的大卡片，加上所有卡片的陳列牆
- **卡片詳細頁**：暗色的展示間，可拖曳傾斜、點一下翻面、切換鐳射樣式試看、匯出卡片檔
- **製作卡片**：上傳照片、調整構圖、加入選用的前景圖層、選擇鐳射與邊框

純 HTML、CSS 和 JavaScript，沒有框架、沒有建置步驟，也沒有後端。照片只在瀏覽器裡處理，存在訪客自己的瀏覽器（IndexedDB），不會上傳到任何伺服器。

## 互動與效果

| 效果 | 做法 |
| --- | --- |
| 物理傾斜 | 每個數值都由彈簧模擬（剛度＋阻尼，固定 60 Hz 積分），移開滑鼠時卡片會帶點慣性地回正 |
| 鐳射光澤 | 兩層相同的圖樣：`color-dodge` 讓亮部發出彩色，淡淡的 `screen` 讓暗部也有一點閃光 |
| 反光 | 一道跟著指標位置移動的放射狀漸層，以 `overlay` 疊在最上層 |
| 2.5D 視差 | 照片往傾斜的反方向移動，前景圖往同方向移動，文字層移動最少，形成前後景深 |
| 陰影 | 獨立在傾斜層外，會往光源的反方向滑開 |
| 陀螺儀 | `deviceorientation` 轉成 -1 到 1 的傾斜量；水平基準會慢慢跟著手持的角度，所以不論怎麼拿手機，卡片都會回到平放 |

五種鐳射：彩虹、星塵（兩層不同尺寸的亮片互相錯動，所以會閃爍）、稜鏡、流光（拉絲金屬＋掃過的光帶）、亮面（只有反光）。鐳射範圍可以是整張、只有照片或只有邊框。邊框有無邊框、白、黑、銀、金。

## 專案結構

```
public/                  ← 網站本體，部署的就是這個資料夾
  index.html             唯一的頁面，用 #/ 路由切換展廳、詳細頁與製作頁
  css/holo-card.css      卡片引擎的所有視覺效果
  css/style.css          網站版面
  js/motion.js           彈簧、動畫迴圈、陀螺儀
  js/holo-card.js        卡片元件
  js/store.js            IndexedDB 儲存
  js/io.js               圖片處理、匯出與匯入卡片檔
  js/view-*.js           三個頁面
  js/app.js              路由與共用工具
  js/config.js           網站名稱、GitHub 連結、首頁主打卡片
  gallery/gallery.js     展廳裡的公開卡片清單
  gallery/*.svg          示範卡片的圖（scripts/make-demo-art.py 產生）
  _headers               Cloudflare 的安全標頭
scripts/add-card.mjs     把卡片檔加入公開展廳
wrangler.jsonc           Cloudflare Workers 設定
```

## 在自己的電腦上執行

任何靜態伺服器都可以：

```bash
# 方法一：Cloudflare 的本機環境（和正式環境最接近，含 _headers）
npm install
npm run dev            # http://localhost:8787

# 方法二：不用安裝任何東西
python3 -m http.server 8000 --directory public
```

> 直接雙擊 `index.html` 也能看，但部分瀏覽器在 `file://` 下不允許儲存卡片或下載示範卡片檔，建議用上面的方式。

陀螺儀只在 HTTPS（或 localhost）下運作。要在手機上測試，部署到 Cloudflare 最簡單，或使用 `npx wrangler dev --ip 0.0.0.0` 搭配 HTTPS 通道工具。

## 部署：GitHub ＋ Cloudflare 自動部署

這個專案使用 Cloudflare Workers 的靜態資源功能，免費方案就夠用（靜態資源請求不計費）。

1. **推到 GitHub**
   ```bash
   git init && git add . && git commit -m "Holo Card"
   git branch -M main
   git remote add origin https://github.com/你的帳號/holo-cards.git
   git push -u origin main
   ```
2. **在 Cloudflare 連接儲存庫**
   Cloudflare 控制台 → **Workers & Pages** → **Create application** → **Import a repository** → 選擇你的 GitHub 帳號與 `holo-cards`。
3. **確認設定**
   - Project name：`holo-cards`（必須和 `wrangler.jsonc` 裡的 `name` 相同，否則建置會失敗）
   - Build command：留空
   - Deploy command：`npx wrangler deploy`（預設值）
   - 按 **Save and Deploy**，完成後會得到一個 `holo-cards.<你的子網域>.workers.dev` 網址。
4. **之後只要 push**
   推到 `main` 會自動部署正式版；推到其他分支會建立預覽版本，網址在 Worker 的 **Previews** 區塊。
5. **自訂網域（選用）**
   Worker → **Settings** → **Domains & Routes** → **Add** → **Custom domain**。

想改名的話，同時修改 `wrangler.jsonc` 的 `name` 和 Cloudflare 上的專案名稱。

<details>
<summary>改用 Cloudflare Pages</summary>

Pages → **Connect to Git** → 選擇儲存庫，Framework preset 選 **None**，Build command 留空，Build output directory 填 `public`。`_headers` 在 Pages 上同樣有效。
</details>

## 自訂

**網站資訊**：編輯 `public/js/config.js`，改網站名稱（也會印在卡片背面）、GitHub 連結和首頁主打的卡片。

**把自己的卡片放進公開展廳**：訪客做的卡片只存在他們自己的瀏覽器裡。要讓所有人都看到某張卡片：

1. 在網站上做好卡片，到詳細頁按「下載卡片檔」，得到 `xxx.holocard.json`
2. 執行
   ```bash
   node scripts/add-card.mjs xxx.holocard.json --id summer-sea
   ```
   腳本會把圖片存到 `public/gallery/`，並把卡片加進 `gallery.js`
3. commit、push，自動部署後就會出現在展廳，網址是 `/#/card/summer-sea`

也可以直接手動編輯 `public/gallery/gallery.js`，每個欄位的意思寫在檔案開頭。

**調整鐳射**：所有圖樣都在 `public/css/holo-card.css` 的 Foil 區段。卡片 JS 每一格畫面會寫入這些變數，CSS 只負責拿它們來畫：

| 變數 | 範圍 | 意義 |
| --- | --- | --- |
| `--rx` `--ry` | 角度 | 卡片傾斜 |
| `--mx` `--my` | 0%–100% | 光源位置 |
| `--dx` `--dy` | -1 到 1 | 指標離中心的偏移，用於視差 |
| `--bgx` `--bgy` | 約 18%–82% | 鐳射圖樣的位置 |
| `--ang` | 角度 | 稜鏡色輪的旋轉 |
| `--o` | 0–1 | 鐳射強度，靜止時較弱，傾斜越大越強 |

要新增一種鐳射，在 `HC.FOILS`（`js/holo-card.js`）加一筆，再在 CSS 寫一段 `.hc[data-foil="你的名稱"] .hc__foil { … }`。

**在其他專案使用卡片元件**：只需要 `css/holo-card.css`、`js/motion.js`、`js/holo-card.js`。

```html
<div id="slot" style="width:300px"></div>
<script>
  const card = new HC.HoloCard(
    { image: "photo.jpg", title: "標題", foil: "prism", frame: "white" },
    { flippable: true, dragTilt: true }
  );
  document.getElementById("slot").appendChild(card.el);
</script>
```

## 陀螺儀的細節

- **iPhone / iPad**：Safari 需要使用者點按才會開放動作感測器，所以會出現「用手機轉動卡片」按鈕，點了之後系統會詢問權限。
- **Android**：在 HTTPS 下會自動啟用。
- **觸控筆電**：瀏覽器有提供事件但不會送資料，偵測到之後按鈕會自動隱藏。
- 卡片會慢慢以你手持的角度作為水平；按「重新校正水平」可立即重設。
- 只有出現在畫面上的卡片會跟著陀螺儀動，捲出畫面的會停止運算。

## 瀏覽器支援

Chrome／Edge 105+、Safari 16+、Firefox 110+（需要 CSS container query 單位 `cqw`）。設定了「減少動態效果」的訪客不會看到首頁卡片的自動擺動，頁面切換也不會有動畫。

## 授權

MIT。示範卡片的圖由 `scripts/make-demo-art.py` 產生，同樣以 MIT 授權。
