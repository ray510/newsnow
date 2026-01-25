import * as cheerio from "cheerio"
import { myFetch } from "#/utils/fetch"
import { defineSource } from "#/utils/source"

/**
 * HKEX Daily Quotation Data Source
 *
 * Endpoints:
 * - Daily Quotation (Main Board): https://www.hkex.com.hk/eng/stat/smstat/dayquot/d{yymmdd}e.htm
 * - Daily Quotation (Main Board Chinese): https://www.hkex.com.hk/chi/stat/smstat/dayquot/d{yymmdd}c.htm
 * - Daily Quotation (GEM): https://www.hkex.com.hk/eng/stat/smstat/dayquot/GEM/e_G{yymmdd}.htm
 * - CSM Daily Stats: https://www.hkex.com.hk/eng/csm/DailyStat/data_tab_daily_{yyyymmdd}e.js
 * - Short Selling: https://www.hkex.com.hk/eng/stat/smstat/ssturnover/ncms/ASHTMAIN.HTM
 */

// Helper to format date as yymmdd
function formatDateYYMMDD(date: Date): string {
  const yy = String(date.getFullYear()).slice(-2)
  const mm = String(date.getMonth() + 1).padStart(2, "0")
  const dd = String(date.getDate()).padStart(2, "0")
  return `${yy}${mm}${dd}`
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

interface HKEXQuote {
  code: string
  name: string
  turnover?: string
  volume?: string
  high?: string
  low?: string
  close?: string
  change?: string
}

/**
 * Parse HKEX Daily Quotation HTML page
 * Data format is fixed-width text inside <pre> tags
 */
async function parseHKEXDailyQuotation(html: string): Promise<HKEXQuote[]> {
  const $ = cheerio.load(html)
  const quotes: HKEXQuote[] = []

  // The data is in <pre> tags with fixed-width format
  // We need to find the "10 Most Actives" or stock listing sections
  const preContent = $("pre").text()

  // Parse the "10 Most Actives" section
  // Format: CODE  NAME OF STOCK   CUR  TURNOVER ($)  SHARES TRADED  HIGH  LOW
  const lines = preContent.split("\n")

  let inActiveSection = false
  for (const line of lines) {
    // Detect section headers
    if (line.includes("10 Most Actives") || line.includes("十大活躍")) {
      inActiveSection = true
      continue
    }

    // Skip separator lines
    if (line.includes("---") || line.trim() === "") {
      continue
    }

    // Parse stock lines (starts with stock code like "00001" or "2800")
    const stockMatch = line.match(/^\s*(\d{4,5})\s+(.+?)\s+(HKD|CNY|USD)\s+([\d,]+)\s+([\d,]+)\s+([\d.]+)\s+([\d.]+)/)
    if (stockMatch && inActiveSection) {
      quotes.push({
        code: stockMatch[1].padStart(5, "0"),
        name: stockMatch[2].trim(),
        turnover: stockMatch[4],
        volume: stockMatch[5],
        high: stockMatch[6],
        low: stockMatch[7],
      })
    }
  }

  return quotes
}

/**
 * HKEX Most Active Stocks
 */
const hkexMostActive = defineSource(async () => {
  const date = getLatestTradingDay()
  const dateStr = formatDateYYMMDD(date)
  const url = `https://www.hkex.com.hk/eng/stat/smstat/dayquot/d${dateStr}e.htm`

  const html = await myFetch(url, {
    headers: {
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
    },
  })

  const quotes = await parseHKEXDailyQuotation(html)

  return quotes.slice(0, 20).map(q => ({
    id: q.code,
    url: `https://www.hkex.com.hk/Market-Data/Securities-Prices/Equities/Equities-Quote?sym=${q.code}&sc_lang=en`,
    title: `${q.code} ${q.name}`,
    extra: {
      info: q.turnover ? `成交額: $${q.turnover}` : undefined,
    },
  }))
})

/**
 * HKEX CSM (China Stock Markets / Stock Connect) Daily Statistics
 * This endpoint returns JavaScript data
 */
const hkexCSMDaily = defineSource(async () => {
  const date = getLatestTradingDay()
  const dateStr = formatDateYYYYMMDD(date)
  const url = `https://www.hkex.com.hk/eng/csm/DailyStat/data_tab_daily_${dateStr}e.js`

  try {
    const jsContent = await myFetch(url, {
      headers: {
        "Referer": "https://www.hkex.com.hk/eng/csm/chinaconndstat_daily.htm",
      },
    })

    // The JS file contains data assignments like:
    // var csm_data = { ... }
    // We need to extract and parse this

    // For now, return a placeholder - we need to see the actual JS format
    return [{
      id: `csm-${dateStr}`,
      url: "https://www.hkex.com.hk/Mutual-Market/Stock-Connect/Statistics?sc_lang=en",
      title: `滬深港通每日統計 ${dateStr}`,
    }]
  }
  catch (error) {
    console.error("Failed to fetch CSM data:", error)
    return []
  }
})

export default defineSource({
  "hkex": hkexMostActive,
  "hkex-most-active": hkexMostActive,
  "hkex-csm": hkexCSMDaily,
})
