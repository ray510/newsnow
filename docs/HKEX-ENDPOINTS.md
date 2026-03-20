# HKEX API 端點文檔

## 概述

本文檔記錄了 HKEX (香港交易所) 的可用數據端點。

---

## 1. CSM 每日統計 (不需要 Token) ✅

### 端點
```
https://www.hkex.com.hk/eng/csm/DailyStat/data_tab_daily_{yyyymmdd}e.js
```

### 參數
- `{yyyymmdd}`: 日期格式，例如 `20260123`
- `e`: 英文版本，`c`: 中文版本

### 返回格式
```javascript
tabData = [
  {
    "id": 0,
    "date": "2026-01-23",
    "market": "SSE Northbound",  // SSE/SZSE Northbound/Southbound
    "tradingDay": 1,
    "content": [
      {
        "style": 1,  // 交易摘要
        "table": {
          "classname": "tradingTable",
          "schema": [["Total Turnover", "Total Trade Count", "DQB", "ETF Turnover"]],
          "tr": [{"td": [["172,236.59"]]}, ...]
        }
      },
      {
        "style": 2,  // 十大成交股
        "table": {
          "classname": "top10Table",
          "schema": [["Rank", "Stock Code", "Stock Name", "Total Turnover"]],
          "tr": [{"td": [["1", "601899", "ZIJIN MINING", "2,472,356,337"]]}, ...]
        }
      }
    ]
  },
  // ... 4 markets total
]
```

### 市場 ID
- `0`: SSE Northbound (滬股通)
- `1`: SSE Southbound (滬港通)
- `2`: SZSE Northbound (深股通)
- `3`: SZSE Southbound (深港通)

---

## 2. Widget API (需要 Token) ⚠️

### Base URL
```
https://www1.hkex.com.hk/hkexwidget/data/{endpoint}
```

### 通用參數
- `lang`: 語言 (`eng` / `chi`)
- `token`: 動態 Token (從頁面獲取)
- `qid`: 查詢 ID (時間戳)
- `callback`: JSONP callback 名稱

### 已確認端點

#### 2.1 市場概況
```
GET /getmarketoverview?lang=eng&token={TOKEN}
GET /getmarketoverview2?lang=eng&token={TOKEN}
```

返回：主要指數數據 (HSI, HSCEI, HSTECH, etc.)

#### 2.2 跑馬燈行情
```
GET /getmarketmarquee?lang=eng&token={TOKEN}&sym=.HSI;.HSCE;.HSTECH
```

參數：`sym` - 分號分隔的指數代碼

#### 2.3 個股報價
```
GET /getequityquote?lang=eng&token={TOKEN}&sym=700
```

參數：`sym` - 股票代碼 (例如 `700`, `9988`, `.HSI`)

返回數據範例：
```json
{
  "data": {
    "responsecode": "000",
    "quote": {
      "hi": "625.000",
      "lo": "610.000",
      "ls": "618.500",
      "pc": "+1.23",
      "nc": "+7.500",
      "amt_os": "9,122,883,125",
      ...
    }
  }
}
```

#### 2.4 股票搜索
```
GET /getstocksearch?lang=eng&token={TOKEN}&q=tencent
```

參數：`q` - 搜索關鍵詞

#### 2.5 市場成交額
```
GET /getmarketturnover?lang=eng&token={TOKEN}
```

### Token 獲取方式

Token 需要從 HKEX 頁面動態獲取，建議使用 Playwright：

```python
from playwright.sync_api import sync_playwright

def get_hkex_token():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()

        token = None
        def handle_request(request):
            nonlocal token
            if "hkexwidget" in request.url and "token=" in request.url:
                # 從 URL 提取 token
                import urllib.parse
                parsed = urllib.parse.urlparse(request.url)
                params = urllib.parse.parse_qs(parsed.query)
                token = params.get('token', [None])[0]

        page.on("request", handle_request)
        page.goto("https://www.hkex.com.hk/")
        page.wait_for_timeout(3000)

        browser.close()
        return token
```

---

## 3. 每日報價 (HTML 格式)

### 主板每日報價
```
https://www.hkex.com.hk/eng/stat/smstat/dayquot/d{yymmdd}e.htm
https://www.hkex.com.hk/chi/stat/smstat/dayquot/d{yymmdd}c.htm
```

### GEM 板每日報價
```
https://www.hkex.com.hk/eng/stat/smstat/dayquot/GEM/e_G{yymmdd}.htm
```

### 參數
- `{yymmdd}`: 兩位年份日期格式，例如 `260123`

---

## 4. 其他端點

### 賣空數據
```
https://www.hkex.com.hk/eng/stat/smstat/ssturnover/ncms/ASHTMAIN.HTM
```

### 證券列表 (Excel)
```
https://www.hkex.com.hk/eng/services/trading/securities/securitieslists/ListOfSecurities.xlsx
```

### 持股披露
```
https://www.hkexnews.hk/sdw/search/stocklist.aspx?sortby=stockcode&shareholdingdate={YYYYMMDD}
```

### 互聯市場持股查詢
```
http://www.hkexnews.hk/sdw/search/mutualmarket.aspx?t=hk  # 港股通
http://www.hkexnews.hk/sdw/search/mutualmarket.aspx?t=sh  # 滬股通
http://www.hkexnews.hk/sdw/search/mutualmarket.aspx?t=sz  # 深股通
```

### Market JSON
```
https://www.hkex.com.hk/Market/Json/calendar/{YYYYMM}_en.json
https://www.hkex.com.hk/Market/Json/card/{GUID}_en.json
```

---

## 5. HKEXnews JSON API

### 新聞公告
```
https://www1.hkexnews.hk/ncms/json/eds/lcisehk1relsdc_{page}.json
```

參數：`{page}` - 頁碼 (1, 2, 3...)

返回格式：
```json
{
  "newsInfoLst": [
    {
      "STOCK_NAME": "Company Name",
      "STOCK_CODE": "0700",
      "TITLE": "Announcement Title",
      "DATE_TIME": "2026-03-20 10:30",
      "NEWS_ID": "123456",
      "LONG_TEXT": "Description",
      "FILE_LINK": "/listedco/listconews/sehk/..."
    }
  ]
}
```

### CCASS 持股查詢
```
https://www3.hkexnews.hk/sdw/search/searchsdw.aspx
```
注意：此端點為 HTML 表單，需要 POST 請求

---

## 6. 端點狀態總結

| 端點 | 需要 Token | 格式 | 狀態 |
|------|-----------|------|------|
| CSM DailyStat | ❌ | JS/JSON | ✅ |
| Widget API | ✅ | JSONP | ✅ |
| Daily Quotation | ❌ | HTML | ✅ |
| Short Selling | ❌ | HTML | ✅ |
| Securities List | ❌ | XLSX | ✅ |
| Shareholding | ❌ | HTML | ✅ |
| HKEXnews JSON | ❌ | JSON | ✅ |
| Calendar JSON | ❌ | JSON | ✅ |

---

## 7. 已實現的數據源

以下是 `server/sources/hkex.ts` 中已實現的數據源：

### 不需要 Token 的數據源

| 數據源 ID | 描述 | 端點 |
|----------|------|------|
| `hkex` | 滬深港通所有數據 | CSM DailyStat |
| `hkex-csm` | 滬深港通所有數據 | CSM DailyStat |
| `hkex-csm-summary` | 滬深港通成交摘要 | CSM DailyStat |
| `hkex-northbound` | 北向十大成交股 | CSM DailyStat |
| `hkex-southbound` | 南向十大成交股 | CSM DailyStat |
| `hkex-sse-northbound` | 滬股通十大成交 | CSM DailyStat |
| `hkex-szse-northbound` | 深股通十大成交 | CSM DailyStat |
| `hkex-sse-southbound` | 滬港通十大成交 | CSM DailyStat |
| `hkex-szse-southbound` | 深港通十大成交 | CSM DailyStat |
| `hkex-news` | HKEX 新聞公告 | HKEXnews JSON |
| `hkex-ipo` | 新股 IPO 公告 | HKEXnews JSON |
| `hkex-calendar` | 交易日曆 | Calendar JSON |
| `hkex-shortselling` | 賣空數據 | HTML 解析 |
| `hkex-daily` | 每日報價 | HTML 解析 |
| `hkex-securities` | 證券列表連結 | 靜態連結 |

### 需要 Token 的數據源 (設置 HKEX_TOKEN 環境變量)

| 數據源 ID | 描述 | 端點 |
|----------|------|------|
| `hkex-market` | 市場概況/主要指數 | getmarketoverview2 |
| `hkex-indices` | 主要指數數據 | getmarketoverview2 |
| `hkex-marquee` | 市場跑馬燈 | getmarketmarquee |
| `hkex-turnover` | 市場成交額 | getmarketturnover |
| `hkex-hotstocks` | 熱門股票報價 | getequityquote |
| `hkex-search` | 股票搜索 | getstocksearch |
| `hkex-bluechips` | 藍籌股報價 | getequityquote |
| `hkex-tech` | 中概科技股報價 | getequityquote |
| `hkex-financials` | 金融股報價 | getequityquote |
| `hkex-property` | 地產股報價 | getequityquote |

---

## 8. 潛在的額外端點 (待驗證)

以下端點可能存在但尚未驗證：

### HKEX Data Portal
```
https://data.hkex.com.hk/
```
提供 CCASS 持股數據等

### HKEX Programmatic Download API
```
https://www.hkex.com.hk/-/media/HKEX-Market/Global/Exchange/FAQ/Market-Data/Getting-Market-Data/Historical-Data/Programmatic-Download-API-Interface-Specification-v1,-d-,0.pdf
```
官方歷史數據下載 API 規範

### Stock Connect 額度數據
HKEX 網站實時顯示北向/南向資金額度餘額，但公開 API 端點待確認

---

## 更新記錄

- 2026-03-20: 添加更多數據源 (藍籌股、科技股、金融股、地產股)
- 2026-01-29: 初始版本，記錄所有已發現端點
