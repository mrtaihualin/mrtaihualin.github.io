# Post prompt

## วิธีใช้
Copy prompt ด้านล่าง → ใส่ข้อมูล → ส่งให้ Claude
Claude จะแก้ไฟล์ให้เองทั้งหมด ไม่ต้อง copy โค้ดเอง

---

## Prompt（複製這一整段）

```
你有權限直接編輯我電腦裡的檔案。請幫我完成以下三件事：

== 步驟 1：讀取現有資料 ==
先讀取以下兩個檔案的內容：
- /Users/taihualin/Documents/Claude/Projects/泰華眼裡的世界/posts-data.js
- /Users/taihualin/Documents/Claude/Projects/泰華眼裡的世界/lessons-data.js

== 步驟 2：新增貼文 ==
將以下資料加入 posts-data.js 的 FB_POSTS 陣列最後（加在最後一個 } 後面，用逗號分隔）：

日期：
標題：
Facebook 貼文網址：
圖片網址：（若無請填「無」）

內文：
（貼上完整貼文內容）

== 步驟 3：生成並新增課程 ==
根據上方貼文，用繁體中文自動生成泰語課程並加入 lessons-data.js 的 SELFSTUDY_ARTICLES 陣列最後。

生成規則：
1. 挑選 3–5 個日常實用詞彙
2. 每個詞彙：泰文 + 拼音 + 中文意思 + 使用情境 + 例句 ×2
3. 設計 4–6 句對話，場景自然，融入上方詞彙

注意：兩個檔案的 id 英文部分必須完全相同，linkedPostId 必須對應 FB_POSTS 的 id

完成後告訴我可以 deploy 了。
```

---

## 完成後
把整個資料夾拖到 [netlify.com/drop](https://netlify.com/drop) 上線。
