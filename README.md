# 3D Cards

把照片做成會反光的 3D 鐳射卡片。

上傳一張照片，選一種鐳射效果，卡片就會跟著滑鼠傾斜、跟著手機轉動，光澤會隨著角度流過整張卡片。

**線上使用：https://3dcards.app.dreamsworld.top/**

不用註冊、不用安裝，打開網頁就能做。照片只在你的瀏覽器裡處理，不會上傳到任何伺服器。

---

## 怎麼做一張卡片

1. 打開網站，按右上角的 **製作卡片**
2. 按 **選擇照片**，或直接把照片拖進預覽區
3. 用 **縮放**、**水平位置**、**垂直位置** 調整照片要露出的部分
4. 填上 **標題**、**副標**、**編號**（都可以留空）
5. 選擇 **鐳射樣式**、**鐳射範圍** 和 **邊框**，右邊的預覽會即時變化
6. 按 **儲存到展廳**

做好的卡片會出現在首頁展廳的「我的卡片」裡。

### 鐳射樣式

| 樣式 | 效果 |
| --- | --- |
| 彩虹 | 斜向的彩虹光帶加上細密的繞射紋 |
| 星塵 | 細碎的亮片，傾斜時會一閃一閃 |
| 稜鏡 | 一圈圈的光環，顏色隨角度旋轉 |
| 流光 | 拉絲金屬的質感，一道光帶掃過 |
| 亮面 | 沒有彩色鐳射，只有光滑的反光 |

**鐳射範圍** 可以選整張卡片、只有照片，或只有邊框。

### 讓卡片更立體：前景圖層

在 **前景圖層** 加一張去背的 PNG（例如把照片裡的人物去背），它會浮在照片上方。傾斜卡片時，前景和背景會往不同方向移動，看起來就像有深度。

前景圖要和原照片一樣大，位置才會對齊。去背可以用手機相簿內建的「拷貝主體」功能，或 remove.bg 之類的免費網站。

---

## 怎麼把玩卡片

| | 電腦 | 手機 |
| --- | --- | --- |
| 傾斜 | 滑鼠在卡片上移動 | 轉動手機，或用手指拖曳卡片 |
| 翻面 | 點一下卡片 | 點一下卡片 |
| 換上一張／下一張 | 按 `[` `]` 鍵，或按右上角的 ‹ › | 在卡片旁邊的空白處左右滑動 |

**iPhone 和 iPad**：第一次要按 **用手機轉動卡片**，再在跳出的視窗按「允許」，卡片才會跟著手機動。

**卡片歪一邊？** 按 **重新校正水平**，卡片會以你現在拿手機的角度當作平放。

---

## 保存和分享你的卡片

做好的卡片存在 **你目前使用的瀏覽器** 裡，所以要注意：

- 換一台裝置、換一個瀏覽器，或用無痕模式，都看不到之前做的卡片
- 清除瀏覽器的網站資料，卡片會一起被刪掉

想備份，或傳給朋友看：

1. 打開卡片，按 **下載卡片檔**，會得到一個 `.holocard.json` 檔案（照片也包含在裡面）
2. 在任何裝置打開網站，到首頁展廳按 **匯入卡片檔**，選這個檔案

卡片就會原樣出現。

---

## 下載到自己的電腦

不想連網路，或想自己改程式，可以下載整個專案：

1. 在這個 GitHub 頁面上方，按綠色的 **Code** 按鈕
2. 選 **Download ZIP**
3. 解壓縮，打開 `public` 資料夾，雙擊 `index.html`

用 Chrome 或 Edge 開啟最穩定。

> 直接雙擊開啟時，示範卡片無法使用「下載卡片檔」，其他功能都正常。
> 如果你的電腦有 Python，可以在專案資料夾執行 `python3 -m http.server 8000 --directory public`，再打開 http://localhost:8000 ，所有功能都能用。

### 放到自己的網站

整個網站就是 `public` 資料夾裡的檔案，不需要資料庫或後端。把 `public` 裡的東西上傳到任何能放靜態網頁的地方（自己的主機、GitHub Pages、Netlify、Cloudflare 等），就能有一份自己的 3D Cards。

上傳前可以先打開 `public/js/config.js` 修改：

- `siteName`：網站名稱，會顯示在左上角和卡片背面
- `repoUrl`：網頁最下方「在 GitHub 查看原始碼」的連結，留空 `""` 就不顯示
- `featured`：首頁的大卡片要放哪一張

---

## 給想修改程式的人

純 HTML、CSS 和 JavaScript，沒有用任何框架，也不需要編譯，改完存檔重新整理就看得到。

```
public/
  index.html             網站唯一的頁面
  css/holo-card.css      卡片的所有視覺效果（鐳射、反光、視差）
  css/style.css          網站版面
  js/holo-card.js        卡片元件
  js/motion.js           彈簧物理、陀螺儀
  js/store.js            把卡片存在瀏覽器（IndexedDB）
  js/io.js               圖片處理、下載和匯入卡片檔
  js/view-gallery.js     首頁展廳
  js/view-detail.js      卡片詳細頁
  js/view-create.js      製作卡片
  js/config.js           網站設定
  gallery/gallery.js     展廳裡的示範卡片清單
scripts/
  add-card.mjs           把卡片檔加入示範展廳（需要 Node.js）
  make-demo-art.py       重新產生示範卡片的圖（需要 Python）
```

### 把自己的卡片放進示範展廳

示範展廳的卡片每個人都看得到。要加入一張：

- **用腳本**：`node scripts/add-card.mjs 你的卡片.holocard.json --id my-card`，會自動把圖片放進 `public/gallery/`，並更新 `gallery.js`
- **手動**：把照片放進 `public/gallery/`，再照 `gallery.js` 開頭的說明加一筆資料

### 調整或新增鐳射效果

所有鐳射都寫在 `css/holo-card.css` 的 Foil 區段。卡片每一格畫面都會更新這些 CSS 變數，鐳射圖樣只要拿它們來畫：

| 變數 | 意義 |
| --- | --- |
| `--rx` `--ry` | 卡片的傾斜角度 |
| `--mx` `--my` | 光源位置（0%–100%） |
| `--dx` `--dy` | 指標離中心多遠（-1 到 1），用來做視差 |
| `--bgx` `--bgy` | 鐳射圖樣的位置 |
| `--o` | 鐳射強度（0–1），傾斜越大越亮 |

新增一種鐳射：在 `js/holo-card.js` 的 `HC.FOILS` 加一筆，再寫一段 `.hc[data-foil="名稱"] .hc__foil { … }`。

### 在其他網頁使用卡片元件

只需要 `css/holo-card.css`、`js/motion.js`、`js/holo-card.js` 三個檔案：

```html
<link rel="stylesheet" href="holo-card.css">
<script src="motion.js"></script>
<script src="holo-card.js"></script>

<div id="slot" style="width: 300px"></div>
<script>
  const card = new HC.HoloCard(
    { image: "photo.jpg", title: "標題", foil: "prism", frame: "white" },
    { flippable: true, dragTilt: true }
  );
  document.getElementById("slot").appendChild(card.el);
</script>
```

---

## 支援的瀏覽器

Chrome、Edge、Safari、Firefox 的近兩年版本都可以使用。手機轉動卡片的功能需要用 `https://` 開頭的網址（或 localhost）。

## 授權

MIT 授權，可以自由使用、修改、商用，只要保留授權聲明。示範卡片的圖由 `scripts/make-demo-art.py` 產生，同樣以 MIT 授權。
