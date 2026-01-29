import { myFetch } from "#/utils/fetch"
import { defineSource } from "#/utils/source"

/**
 * HKEX Data Source - Hong Kong Stock Exchange
 *
 * Endpoints:
 * - CSM Daily Stats: https://www.hkex.com.hk/eng/csm/DailyStat/data_tab_daily_{yyyymmdd}e.js
 * - Daily Quotation (Main Board): https://www.hkex.com.hk/eng/stat/smstat/dayquot/d{yymmdd}e.htm
 * - Daily Quotation (GEM): https://www.hkex.com.hk/eng/stat/smstat/dayquot/GEM/e_G{yymmdd}.htm
 * - Short Selling: https://www.hkex.com.hk/eng/stat/smstat/ssturnover/ncms/ASHTMAIN.HTM
 */

// Helper to format date as yyyymmdd
function formatDateYYYYMMDD(date: Date): string {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, "0")
  const dd = String(date.getDate()).padStart(2, "0")
  return `${yyyy}${mm}${dd}`
}

// Get the latest trading day (skip weekends)
function getLatestTradingDay(): Date {
  const now = new Date()
  const day = now.getDay()
  // If Sunday (0), go back 2 days; if Saturday (6), go back 1 day
  if (day === 0) now.setDate(now.getDate() - 2)
  else if (day === 6) now.setDate(now.getDate() - 1)
  return now
}

/**
 * CSM Data Types
 * Market IDs: 0=SSE Northbound, 1=SSE Southbound, 2=SZSE Northbound, 3=SZSE Southbound
 */
interface CSMTableRow {
  td: string[][]
}

interface CSMTable {
  classname: string
  schema: string[][]
  tr: CSMTableRow[]
}

interface CSMContent {
  style: number // 1=trading summary, 2=top10 stocks
  table: CSMTable
}

interface CSMMarketData {
  id: number
  date: string
  market: string
  tradingDay: number
  content: CSMContent[]
}

/**
 * Parse CSM JavaScript data
 * Format: tabData = [ { id, date, market, tradingDay, content: [...] }, ... ]
 */
function parseCSMData(jsContent: string): CSMMarketData[] {
  // Remove "tabData = " prefix and parse as JSON
  const jsonStr = jsContent.replace(/^tabData\s*=\s*/, "").trim()
  return JSON.parse(jsonStr)
}

/**
 * Extract top 10 stocks from CSM data
 */
interface CSMStock {
  rank: string
  code: string
  name: string
  buyTurnover?: string
  sellTurnover?: string
  totalTurnover: string
  market: string
}

function extractTop10Stocks(data: CSMMarketData[]): CSMStock[] {
  const stocks: CSMStock[] = []

  for (const market of data) {
    const top10Content = market.content.find(c => c.style === 2)
    if (!top10Content) continue

    for (const row of top10Content.table.tr) {
      const td = row.td[0] // Data is in first element of td array
      if (td.length >= 4) {
        // Northbound: [Rank, Stock Code, Stock Name, Total Turnover]
        // Southbound: [Rank, Stock Code, Stock Name, Buy Turnover, Sell Turnover, Total Turnover]
        const isSouthbound = market.market.includes("Southbound")
        stocks.push({
          rank: td[0],
          code: td[1],
          name: td[2],
          buyTurnover: isSouthbound ? td[3] : undefined,
          sellTurnover: isSouthbound ? td[4] : undefined,
          totalTurnover: isSouthbound ? td[5] : td[3],
          market: market.market,
        })
      }
    }
  }

  return stocks
}

/**
 * Extract trading summary from CSM data
 */
interface CSMTradingSummary {
  market: string
  date: string
  totalTurnover: string
  totalTradeCount: string
  dqb?: string
  etfTurnover: string
  buyTurnover?: string
  sellTurnover?: string
}

function extractTradingSummary(data: CSMMarketData[]): CSMTradingSummary[] {
  const summaries: CSMTradingSummary[] = []

  for (const market of data) {
    const tradingContent = market.content.find(c => c.style === 1)
    if (!tradingContent) continue

    const values = tradingContent.table.tr.map(row => row.td[0][0])
    const isNorthbound = market.market.includes("Northbound")

    if (isNorthbound) {
      // Northbound: [Total Turnover, Total Trade Count, DQB, ETF Turnover]
      summaries.push({
        market: market.market,
        date: market.date,
        totalTurnover: values[0],
        totalTradeCount: values[1],
        dqb: values[2],
        etfTurnover: values[3],
      })
    }
    else {
      // Southbound: [Total Turnover, Buy Turnover, Sell Turnover, Total Trade Count, Buy Trade Count, Sell Trade Count, ETF Turnover]
      summaries.push({
        market: market.market,
        date: market.date,
        totalTurnover: values[0],
        buyTurnover: values[1],
        sellTurnover: values[2],
        totalTradeCount: values[3],
        etfTurnover: values[6],
      })
    }
  }

  return summaries
}

/**
 * HKEX CSM Northbound Top Stocks (滬股通/深股通 十大成交股)
 */
const hkexNorthbound = defineSource(async () => {
  const date = getLatestTradingDay()
  const dateStr = formatDateYYYYMMDD(date)
  const url = `https://www.hkex.com.hk/eng/csm/DailyStat/data_tab_daily_${dateStr}e.js`

  const jsContent: string = await myFetch(url, {
    headers: {
      "Referer": "https://www.hkex.com.hk/eng/csm/chinaconndstat_daily.htm",
    },
    responseType: "text",
  })

  const data = parseCSMData(jsContent)
  const stocks = extractTop10Stocks(data)

  // Filter northbound stocks (SSE & SZSE Northbound)
  const northboundStocks = stocks.filter(s => s.market.includes("Northbound"))

  return northboundStocks.map(s => ({
    id: `${s.code}-${s.market}`,
    url: s.market.includes("SSE")
      ? `https://www.sse.com.cn/assortment/stock/list/info/company/index.shtml?COMPANY_CODE=${s.code}`
      : `https://www.szse.cn/certificate/individual/index.html?code=${s.code}`,
    title: `${s.code} ${s.name}`,
    extra: {
      info: `${s.market.replace(" Northbound", "")} | 成交額: ¥${s.totalTurnover}`,
    },
  }))
})

/**
 * HKEX CSM Southbound Top Stocks (港股通 十大成交股)
 */
const hkexSouthbound = defineSource(async () => {
  const date = getLatestTradingDay()
  const dateStr = formatDateYYYYMMDD(date)
  const url = `https://www.hkex.com.hk/eng/csm/DailyStat/data_tab_daily_${dateStr}e.js`

  const jsContent: string = await myFetch(url, {
    headers: {
      "Referer": "https://www.hkex.com.hk/eng/csm/chinaconndstat_daily.htm",
    },
    responseType: "text",
  })

  const data = parseCSMData(jsContent)
  const stocks = extractTop10Stocks(data)

  // Filter southbound stocks (SSE & SZSE Southbound)
  const southboundStocks = stocks.filter(s => s.market.includes("Southbound"))

  return southboundStocks.map(s => ({
    id: `${s.code}-${s.market}`,
    url: `https://www.hkex.com.hk/Market-Data/Securities-Prices/Equities/Equities-Quote?sym=${s.code}&sc_lang=en`,
    title: `${s.code} ${s.name}`,
    extra: {
      info: `${s.market.replace(" Southbound", "")} | 買入: $${s.buyTurnover} | 賣出: $${s.sellTurnover}`,
    },
  }))
})

/**
 * HKEX CSM All Top Stocks (滬深港通 所有十大成交股)
 */
const hkexCSMAll = defineSource(async () => {
  const date = getLatestTradingDay()
  const dateStr = formatDateYYYYMMDD(date)
  const url = `https://www.hkex.com.hk/eng/csm/DailyStat/data_tab_daily_${dateStr}e.js`

  const jsContent: string = await myFetch(url, {
    headers: {
      "Referer": "https://www.hkex.com.hk/eng/csm/chinaconndstat_daily.htm",
    },
    responseType: "text",
  })

  const data = parseCSMData(jsContent)
  const summaries = extractTradingSummary(data)
  const stocks = extractTop10Stocks(data)

  // Create summary items
  const summaryItems = summaries.map(s => ({
    id: `summary-${s.market}`,
    url: "https://www.hkex.com.hk/Mutual-Market/Stock-Connect/Statistics?sc_lang=en",
    title: `📊 ${s.market}`,
    extra: {
      info: `成交額: ${s.market.includes("Northbound") ? "¥" : "$"}${s.totalTurnover}M | 成交筆數: ${s.totalTradeCount}`,
    },
  }))

  // Create stock items
  const stockItems = stocks.slice(0, 20).map(s => ({
    id: `${s.code}-${s.market}`,
    url: s.market.includes("Southbound")
      ? `https://www.hkex.com.hk/Market-Data/Securities-Prices/Equities/Equities-Quote?sym=${s.code}&sc_lang=en`
      : s.market.includes("SSE")
        ? `https://www.sse.com.cn/assortment/stock/list/info/company/index.shtml?COMPANY_CODE=${s.code}`
        : `https://www.szse.cn/certificate/individual/index.html?code=${s.code}`,
    title: `${s.code} ${s.name}`,
    extra: {
      info: `#${s.rank} ${s.market}`,
    },
  }))

  return [...summaryItems, ...stockItems]
})

/**
 * HKEX Market Calendar (交易日曆)
 * Endpoint: https://www.hkex.com.hk/Market/Json/calendar/{YYYYMM}_en.json
 */
interface CalendarEvent {
  date: string
  title: string
  type: string
}

interface CalendarResponse {
  events: CalendarEvent[]
}

const hkexCalendar = defineSource(async () => {
  const now = new Date()
  const yyyy = now.getFullYear()
  const mm = String(now.getMonth() + 1).padStart(2, "0")

  const url = `https://www.hkex.com.hk/Market/Json/calendar/${yyyy}${mm}_en.json`

  try {
    const data: CalendarResponse = await myFetch(url)

    if (!data.events || data.events.length === 0) {
      return []
    }

    return data.events.slice(0, 10).map(event => ({
      id: `calendar-${event.date}`,
      url: "https://www.hkex.com.hk/Services/Trading/Trading-Calendar?sc_lang=en",
      title: event.title,
      extra: {
        info: `${event.date} | ${event.type}`,
      },
    }))
  }
  catch {
    return []
  }
})

/**
 * HKEX News JSON (新聞公告)
 * Endpoint: https://www1.hkexnews.hk/ncms/json/eds/lcisehk1relsdc_{page}.json
 */
interface HKEXNewsItem {
  STOCK_NAME?: string
  STOCK_CODE?: string
  TITLE?: string
  DATE_TIME?: string
  NEWS_ID?: string
  LONG_TEXT?: string
  FILE_LINK?: string
}

interface HKEXNewsResponse {
  newsInfoLst?: HKEXNewsItem[]
}

const hkexNews = defineSource(async () => {
  const url = "https://www1.hkexnews.hk/ncms/json/eds/lcisehk1relsdc_1.json"

  try {
    const data: HKEXNewsResponse = await myFetch(url)

    if (!data.newsInfoLst || data.newsInfoLst.length === 0) {
      return []
    }

    return data.newsInfoLst.slice(0, 20).map(item => ({
      id: item.NEWS_ID || `news-${item.DATE_TIME}`,
      url: item.FILE_LINK
        ? `https://www1.hkexnews.hk${item.FILE_LINK}`
        : "https://www.hkexnews.hk/",
      title: item.TITLE || item.LONG_TEXT || "HKEX News",
      extra: {
        info: item.STOCK_CODE
          ? `${item.STOCK_CODE} ${item.STOCK_NAME} | ${item.DATE_TIME}`
          : item.DATE_TIME,
      },
    }))
  }
  catch {
    return []
  }
})

/**
 * HKEX IPO News (新股公告)
 */
const hkexIPO = defineSource(async () => {
  // IPO news from page 1
  const url = "https://www1.hkexnews.hk/ncms/json/eds/lcisehk1relsdc_1.json"

  try {
    const data: HKEXNewsResponse = await myFetch(url)

    if (!data.newsInfoLst) {
      return []
    }

    // Filter for IPO related news (new listings)
    const ipoNews = data.newsInfoLst.filter(item =>
      item.TITLE?.includes("Listing") ||
      item.TITLE?.includes("IPO") ||
      item.TITLE?.includes("Prospectus") ||
      item.LONG_TEXT?.includes("new listing"),
    )

    return ipoNews.slice(0, 10).map(item => ({
      id: item.NEWS_ID || `ipo-${item.DATE_TIME}`,
      url: item.FILE_LINK
        ? `https://www1.hkexnews.hk${item.FILE_LINK}`
        : "https://www.hkexnews.hk/",
      title: item.TITLE || "IPO News",
      extra: {
        info: item.STOCK_CODE
          ? `${item.STOCK_CODE} | ${item.DATE_TIME}`
          : item.DATE_TIME,
      },
    }))
  }
  catch {
    return []
  }
})

/**
 * SSE Northbound Only (滬股通)
 */
const hkexSSENorthbound = defineSource(async () => {
  const date = getLatestTradingDay()
  const dateStr = formatDateYYYYMMDD(date)
  const url = `https://www.hkex.com.hk/eng/csm/DailyStat/data_tab_daily_${dateStr}e.js`

  const jsContent: string = await myFetch(url, {
    headers: {
      "Referer": "https://www.hkex.com.hk/eng/csm/chinaconndstat_daily.htm",
    },
    responseType: "text",
  })

  const data = parseCSMData(jsContent)
  const stocks = extractTop10Stocks(data)

  // Filter SSE Northbound only
  const sseStocks = stocks.filter(s => s.market === "SSE Northbound")

  return sseStocks.map(s => ({
    id: `${s.code}-sse`,
    url: `https://www.sse.com.cn/assortment/stock/list/info/company/index.shtml?COMPANY_CODE=${s.code}`,
    title: `${s.code} ${s.name}`,
    extra: {
      info: `#${s.rank} 滬股通 | 成交額: ¥${s.totalTurnover}`,
    },
  }))
})

/**
 * SZSE Northbound Only (深股通)
 */
const hkexSZSENorthbound = defineSource(async () => {
  const date = getLatestTradingDay()
  const dateStr = formatDateYYYYMMDD(date)
  const url = `https://www.hkex.com.hk/eng/csm/DailyStat/data_tab_daily_${dateStr}e.js`

  const jsContent: string = await myFetch(url, {
    headers: {
      "Referer": "https://www.hkex.com.hk/eng/csm/chinaconndstat_daily.htm",
    },
    responseType: "text",
  })

  const data = parseCSMData(jsContent)
  const stocks = extractTop10Stocks(data)

  // Filter SZSE Northbound only
  const szseStocks = stocks.filter(s => s.market === "SZSE Northbound")

  return szseStocks.map(s => ({
    id: `${s.code}-szse`,
    url: `https://www.szse.cn/certificate/individual/index.html?code=${s.code}`,
    title: `${s.code} ${s.name}`,
    extra: {
      info: `#${s.rank} 深股通 | 成交額: ¥${s.totalTurnover}`,
    },
  }))
})

/**
 * SSE Southbound Only (滬港通-港股)
 */
const hkexSSESouthbound = defineSource(async () => {
  const date = getLatestTradingDay()
  const dateStr = formatDateYYYYMMDD(date)
  const url = `https://www.hkex.com.hk/eng/csm/DailyStat/data_tab_daily_${dateStr}e.js`

  const jsContent: string = await myFetch(url, {
    headers: {
      "Referer": "https://www.hkex.com.hk/eng/csm/chinaconndstat_daily.htm",
    },
    responseType: "text",
  })

  const data = parseCSMData(jsContent)
  const stocks = extractTop10Stocks(data)

  // Filter SSE Southbound only
  const sseStocks = stocks.filter(s => s.market === "SSE Southbound")

  return sseStocks.map(s => ({
    id: `${s.code}-sse-sb`,
    url: `https://www.hkex.com.hk/Market-Data/Securities-Prices/Equities/Equities-Quote?sym=${s.code}&sc_lang=en`,
    title: `${s.code} ${s.name}`,
    extra: {
      info: `#${s.rank} 滬港通 | 買: $${s.buyTurnover} 賣: $${s.sellTurnover}`,
    },
  }))
})

/**
 * SZSE Southbound Only (深港通-港股)
 */
const hkexSZSESouthbound = defineSource(async () => {
  const date = getLatestTradingDay()
  const dateStr = formatDateYYYYMMDD(date)
  const url = `https://www.hkex.com.hk/eng/csm/DailyStat/data_tab_daily_${dateStr}e.js`

  const jsContent: string = await myFetch(url, {
    headers: {
      "Referer": "https://www.hkex.com.hk/eng/csm/chinaconndstat_daily.htm",
    },
    responseType: "text",
  })

  const data = parseCSMData(jsContent)
  const stocks = extractTop10Stocks(data)

  // Filter SZSE Southbound only
  const szseStocks = stocks.filter(s => s.market === "SZSE Southbound")

  return szseStocks.map(s => ({
    id: `${s.code}-szse-sb`,
    url: `https://www.hkex.com.hk/Market-Data/Securities-Prices/Equities/Equities-Quote?sym=${s.code}&sc_lang=en`,
    title: `${s.code} ${s.name}`,
    extra: {
      info: `#${s.rank} 深港通 | 買: $${s.buyTurnover} 賣: $${s.sellTurnover}`,
    },
  }))
})

export default defineSource({
  // Stock Connect 滬深港通
  "hkex": hkexCSMAll,
  "hkex-csm": hkexCSMAll,
  "hkex-northbound": hkexNorthbound,
  "hkex-southbound": hkexSouthbound,

  // Individual markets
  "hkex-sse-northbound": hkexSSENorthbound,
  "hkex-szse-northbound": hkexSZSENorthbound,
  "hkex-sse-southbound": hkexSSESouthbound,
  "hkex-szse-southbound": hkexSZSESouthbound,

  // News & Calendar
  "hkex-news": hkexNews,
  "hkex-ipo": hkexIPO,
  "hkex-calendar": hkexCalendar,
})
