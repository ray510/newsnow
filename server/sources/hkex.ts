import process from "node:process"
import { myFetch } from "#/utils/fetch"
import { defineSource } from "#/utils/source"

/**
 * HKEX Data Source - Hong Kong Stock Exchange
 *
 * Endpoints:
 * - CSM Daily Stats: https://www.hkex.com.hk/eng/csm/DailyStat/data_tab_daily_{yyyymmdd}e.js
 * - Widget API: https://www1.hkex.com.hk/hkexwidget/data/{endpoint}?token={TOKEN}
 * - Daily Quotation (Main Board): https://www.hkex.com.hk/eng/stat/smstat/dayquot/d{yymmdd}e.htm
 * - Short Selling: https://www.hkex.com.hk/eng/stat/smstat/ssturnover/ncms/ASHTMAIN.HTM
 *
 * Widget API requires token from env: HKEX_TOKEN
 */

// HKEX Widget API Base URL
const WIDGET_API_BASE = "https://www1.hkex.com.hk/hkexwidget/data"

// Get token from environment variable
function getHKEXToken(): string | undefined {
  return process.env.HKEX_TOKEN
}

/**
 * Parse JSONP response to JSON
 * Format: jQuery_callback({...})
 */
function parseJSONP(text: string): unknown {
  const match = text.match(/\((.+)\)/)
  if (match && match[1]) {
    return JSON.parse(match[1])
  }
  return JSON.parse(text)
}

/**
 * Fetch from HKEX Widget API
 */
async function fetchWidgetAPI<T>(endpoint: string, params: Record<string, string> = {}): Promise<T | null> {
  const token = getHKEXToken()
  if (!token) {
    console.warn("HKEX_TOKEN not set, Widget API unavailable")
    return null
  }

  const url = new URL(`${WIDGET_API_BASE}/${endpoint}`)
  url.searchParams.set("lang", "eng")
  url.searchParams.set("token", token)
  url.searchParams.set("qid", Date.now().toString())
  url.searchParams.set("callback", "jQuery_callback")

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }

  try {
    const text: string = await myFetch(url.toString(), {
      headers: {
        "Referer": "https://www.hkex.com.hk/",
      },
      responseType: "text",
    })

    return parseJSONP(text) as T
  }
  catch (error) {
    console.error(`HKEX Widget API error (${endpoint}):`, error)
    return null
  }
}

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

// ============================================================
// Widget API Types & Sources (需要 HKEX_TOKEN 環境變量)
// ============================================================

/**
 * Market Overview Response
 */
interface MarketIndex {
  nm_s: string // Short name
  nm_l: string // Long name
  ric: string // Reuters Instrument Code
  ls: string // Last price
  nc: string // Net change
  pc: string // Percent change
  hi: string // High
  lo: string // Low
  op: string // Open
  hc: string // Previous close
  date: string
  tm: string // Time
  ts: number // Timestamp
  type: string
}

interface MarketOverviewResponse {
  responsecode: string
  indices: MarketIndex[]
}

/**
 * HKEX Market Overview (市場概況 - 主要指數)
 * Endpoint: getmarketoverview2
 */
const hkexMarketOverview = defineSource(async () => {
  const data = await fetchWidgetAPI<MarketOverviewResponse>("getmarketoverview2")

  if (!data || data.responsecode !== "000" || !data.indices) {
    return []
  }

  return data.indices.slice(0, 15).map(idx => ({
    id: idx.ric,
    url: `https://www.hkex.com.hk/Market-Data/Securities-Prices/Equities?sc_lang=en`,
    title: `${idx.nm_s} ${idx.ls}`,
    extra: {
      info: `${idx.nc} (${idx.pc}%) | H: ${idx.hi} L: ${idx.lo} | ${idx.tm}`,
    },
  }))
})

/**
 * Equity Quote Response
 */
interface EquityQuote {
  sym: string
  nm: string
  ls: string // Last price
  nc: string // Net change
  pc: string // Percent change
  hi: string // High
  lo: string // Low
  op: string // Open
  hc: string // Previous close
  vo: string // Volume
  am: string // Amount
  mktcap?: string
}

interface EquityQuoteResponse {
  data: {
    responsecode: string
    quote: EquityQuote
  }
}

/**
 * HKEX Hot Stocks Quote (熱門股票報價)
 * Fetches quotes for popular HK stocks
 */
const hkexHotStocks = defineSource(async () => {
  // Popular HK stock codes
  const hotSymbols = ["700", "9988", "1810", "9618", "3690", "2318", "941", "1299", "388", "5"]

  const results = await Promise.all(
    hotSymbols.map(sym =>
      fetchWidgetAPI<EquityQuoteResponse>("getequityquote", { sym }),
    ),
  )

  return results
    .filter((r): r is EquityQuoteResponse => r !== null && r.data?.responsecode === "000")
    .map(r => ({
      id: r.data.quote.sym,
      url: `https://www.hkex.com.hk/Market-Data/Securities-Prices/Equities/Equities-Quote?sym=${r.data.quote.sym}&sc_lang=en`,
      title: `${r.data.quote.sym} ${r.data.quote.nm} $${r.data.quote.ls}`,
      extra: {
        info: `${r.data.quote.nc} (${r.data.quote.pc}%) | 成交量: ${r.data.quote.vo}`,
      },
    }))
})

/**
 * Stock Search Response
 */
interface StockSearchResult {
  sym: string
  nm: string
  type: string
}

interface StockSearchResponse {
  data: {
    responsecode: string
    stocklist: StockSearchResult[]
  }
}

/**
 * Market Turnover Response
 */
interface TurnoverData {
  turnover: string
  tradecount: string
  date: string
  time: string
}

interface MarketTurnoverResponse {
  data: {
    responsecode: string
    turnover: TurnoverData
  }
}

/**
 * HKEX Market Turnover (市場成交額)
 */
const hkexMarketTurnover = defineSource(async () => {
  const data = await fetchWidgetAPI<MarketTurnoverResponse>("getmarketturnover")

  if (!data || data.data?.responsecode !== "000") {
    return []
  }

  const turnover = data.data.turnover

  return [{
    id: "market-turnover",
    url: "https://www.hkex.com.hk/Market-Data/Statistics/Consolidated-Reports/HKEX-Monthly-Market-Highlights?sc_lang=en",
    title: `📊 港股成交額: $${turnover.turnover}`,
    extra: {
      info: `成交筆數: ${turnover.tradecount} | ${turnover.date} ${turnover.time}`,
    },
  }]
})

/**
 * Market Marquee Response (跑馬燈)
 */
interface MarqueeItem {
  sym: string
  nm: string
  ls: string
  nc: string
  pc: string
}

interface MarketMarqueeResponse {
  responsecode: string
  items: MarqueeItem[]
}

/**
 * HKEX Market Marquee (市場跑馬燈 - 主要指數實時)
 */
const hkexMarketMarquee = defineSource(async () => {
  const data = await fetchWidgetAPI<MarketMarqueeResponse>("getmarketmarquee", {
    sym: ".HSI;.HSCE;.HSTECH;.CSI300;CNH=X",
  })

  if (!data || data.responsecode !== "000" || !data.items) {
    return []
  }

  return data.items.map(item => ({
    id: item.sym,
    url: "https://www.hkex.com.hk/Market-Data/Securities-Prices/Equities?sc_lang=en",
    title: `${item.nm} ${item.ls}`,
    extra: {
      info: `${item.nc} (${item.pc}%)`,
    },
  }))
})

// ============================================================
// CSM Data Types (不需要 Token)
// ============================================================

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
  // Stock Connect 滬深港通 (不需要 Token)
  "hkex": hkexCSMAll,
  "hkex-csm": hkexCSMAll,
  "hkex-northbound": hkexNorthbound,
  "hkex-southbound": hkexSouthbound,

  // Individual markets (不需要 Token)
  "hkex-sse-northbound": hkexSSENorthbound,
  "hkex-szse-northbound": hkexSZSENorthbound,
  "hkex-sse-southbound": hkexSSESouthbound,
  "hkex-szse-southbound": hkexSZSESouthbound,

  // News & Calendar (不需要 Token)
  "hkex-news": hkexNews,
  "hkex-ipo": hkexIPO,
  "hkex-calendar": hkexCalendar,

  // Widget API (需要 HKEX_TOKEN 環境變量)
  "hkex-market": hkexMarketOverview,
  "hkex-indices": hkexMarketOverview,
  "hkex-marquee": hkexMarketMarquee,
  "hkex-hotstocks": hkexHotStocks,
  "hkex-turnover": hkexMarketTurnover,
})
