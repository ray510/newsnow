#!/usr/bin/env python3
"""
HKEX Widget API Endpoint Discovery Script
用於探索 HKEX 所有可用的 API 端點
"""

import requests
import json
from urllib.parse import quote

# 🔴 填入你的 Token
TOKEN = "evLtsLsBNAUVTPxtGqVeGw/2R5hKferH5AxyvB39TQ6pxOB2xfM1HlKp0ASriy/F"

HEADERS = {
    "Referer": "https://www.hkex.com.hk/",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json, text/javascript, */*; q=0.01",
}

BASE_URL = "https://www1.hkex.com.hk/hkexwidget/data"

# 預期可能存在的端點列表
ENDPOINTS_TO_TEST = [
    # 市場概況
    {"name": "市場概況", "endpoint": "getmarketoverview", "params": {}},
    {"name": "市場概況2", "endpoint": "getmarketoverview2", "params": {}},

    # 跑馬燈/行情
    {"name": "跑馬燈", "endpoint": "getmarketmarquee", "params": {"sym": ".HSI;.HSCE;.HSTECH"}},
    {"name": "市場行情", "endpoint": "getmarketquote", "params": {}},

    # 個股報價
    {"name": "個股報價 (700)", "endpoint": "getequityquote", "params": {"sym": "700"}},
    {"name": "個股報價 (9988)", "endpoint": "getequityquote", "params": {"sym": "9988"}},
    {"name": "個股報價 (HSI)", "endpoint": "getequityquote", "params": {"sym": ".HSI"}},

    # 股票列表
    {"name": "股票列表", "endpoint": "getstocklist", "params": {}},
    {"name": "證券列表", "endpoint": "getsecuritieslist", "params": {}},
    {"name": "股票搜索", "endpoint": "getstocksearch", "params": {"q": "tencent"}},

    # 指數
    {"name": "指數詳情", "endpoint": "getindexdetail", "params": {"sym": ".HSI"}},
    {"name": "指數報價", "endpoint": "getindexquote", "params": {"sym": ".HSI"}},
    {"name": "指數列表", "endpoint": "getindexlist", "params": {}},

    # 成交額/成交量
    {"name": "市場成交額", "endpoint": "getmarketturnover", "params": {}},
    {"name": "成交統計", "endpoint": "getturnoverstat", "params": {}},
    {"name": "成交排行", "endpoint": "getturnoverranking", "params": {}},

    # 衍生品
    {"name": "衍生品", "endpoint": "getderivatives", "params": {}},
    {"name": "期貨報價", "endpoint": "getfuturesquote", "params": {"sym": "HSI"}},
    {"name": "期權報價", "endpoint": "getoptionsquote", "params": {"sym": "HSI"}},

    # 市場數據
    {"name": "市場詳情", "endpoint": "getmarketdetail", "params": {}},
    {"name": "市場統計", "endpoint": "getmarketstat", "params": {}},
    {"name": "市場摘要", "endpoint": "getmarketsummary", "params": {}},

    # Stock Connect 滬深港通
    {"name": "滬深港通", "endpoint": "getstockconnect", "params": {}},
    {"name": "北向資金", "endpoint": "getnorthbound", "params": {}},
    {"name": "南向資金", "endpoint": "getsouthbound", "params": {}},

    # 其他
    {"name": "熱門股票", "endpoint": "gethotstocks", "params": {}},
    {"name": "漲跌排行", "endpoint": "gettopgainers", "params": {}},
    {"name": "新聞", "endpoint": "getnews", "params": {}},
    {"name": "公告", "endpoint": "getannouncements", "params": {}},
    {"name": "日曆", "endpoint": "getcalendar", "params": {}},

    # 延遲報價 (可能是另一個路徑)
    {"name": "延遲報價", "endpoint": "getdelayedquote", "params": {"sym": "700"}},
    {"name": "即時報價", "endpoint": "getrealtimequote", "params": {"sym": "700"}},

    # 額外測試端點
    {"name": "ETF報價", "endpoint": "getetfquote", "params": {"sym": "2800"}},
    {"name": "期權鏈", "endpoint": "getoptionchain", "params": {"sym": "700"}},
    {"name": "歷史數據", "endpoint": "gethistoricaldata", "params": {"sym": "700"}},
    {"name": "K線數據", "endpoint": "getklinedata", "params": {"sym": "700"}},
    {"name": "分時數據", "endpoint": "gettimelinedata", "params": {"sym": "700"}},
    {"name": "大盤數據", "endpoint": "getmarketdata", "params": {}},
    {"name": "板塊數據", "endpoint": "getsectordata", "params": {}},
    {"name": "行業數據", "endpoint": "getindustrydata", "params": {}},
    {"name": "公司資料", "endpoint": "getcompanyinfo", "params": {"sym": "700"}},
    {"name": "財務數據", "endpoint": "getfinancialdata", "params": {"sym": "700"}},
]

def clean_jsonp(text):
    """清洗 JSONP 格式"""
    if text.startswith("jQuery") or text.startswith("callback") or "(" in text:
        start = text.find("(")
        end = text.rfind(")")
        if start != -1 and end != -1:
            return text[start+1:end]
    return text

def test_endpoint(name, endpoint, extra_params):
    """測試單個端點"""
    url = f"{BASE_URL}/{endpoint}"
    params = {
        "lang": "eng",
        "token": TOKEN,
        "qid": "123456789",
        "callback": "jQuery_callback",
        "_": "1769681943576",
        **extra_params
    }

    try:
        r = requests.get(url, params=params, headers=HEADERS, timeout=10)

        if r.status_code == 404:
            return {"status": "❌ 404", "data": None}

        if r.status_code != 200:
            return {"status": f"❌ {r.status_code}", "data": None}

        text = clean_jsonp(r.text)

        # 檢查是否為空或錯誤
        if not text or text.strip() == "":
            return {"status": "❌ 空響應", "data": None}

        try:
            data = json.loads(text)

            # 檢查是否有錯誤碼
            if isinstance(data, dict):
                if data.get("responsecode") == "001" or data.get("error"):
                    return {"status": "❌ API錯誤", "data": data}

            return {"status": "✅ 成功", "data": data}

        except json.JSONDecodeError:
            # 可能是 HTML 或其他格式
            if "<html" in text.lower():
                return {"status": "❌ HTML", "data": None}
            return {"status": "⚠️ 非JSON", "data": text[:200]}

    except requests.exceptions.Timeout:
        return {"status": "❌ 超時", "data": None}
    except Exception as e:
        return {"status": f"❌ 錯誤: {str(e)[:50]}", "data": None}

def main():
    print("=" * 60)
    print("🔍 HKEX Widget API 端點探索")
    print("=" * 60)
    print(f"Token: {TOKEN[:20]}...")
    print(f"Base URL: {BASE_URL}")
    print("=" * 60)
    print()

    successful = []
    failed = []

    for item in ENDPOINTS_TO_TEST:
        name = item["name"]
        endpoint = item["endpoint"]
        params = item["params"]

        print(f"🧪 測試: {name} ({endpoint})")
        result = test_endpoint(name, endpoint, params)

        print(f"   {result['status']}")

        if result["status"].startswith("✅"):
            successful.append({
                "name": name,
                "endpoint": endpoint,
                "params": params,
                "sample": result["data"]
            })
            # 顯示部分數據
            if result["data"]:
                preview = json.dumps(result["data"], ensure_ascii=False)[:150]
                print(f"   📊 {preview}...")
        else:
            failed.append({"name": name, "endpoint": endpoint, "status": result["status"]})

        print()

    # 總結
    print("=" * 60)
    print("📊 測試結果總結")
    print("=" * 60)

    print(f"\n✅ 成功的端點 ({len(successful)}):")
    for item in successful:
        params_str = ", ".join([f"{k}={v}" for k, v in item["params"].items()])
        print(f"   • {item['name']}: {item['endpoint']}")
        if params_str:
            print(f"     參數: {params_str}")

    print(f"\n❌ 失敗的端點 ({len(failed)}):")
    for item in failed:
        print(f"   • {item['name']}: {item['endpoint']} - {item['status']}")

    # 導出成功的端點
    if successful:
        print("\n" + "=" * 60)
        print("📝 成功端點的完整 URL:")
        print("=" * 60)
        for item in successful:
            params = {
                "lang": "eng",
                "token": "{TOKEN}",
                **item["params"]
            }
            params_str = "&".join([f"{k}={v}" for k, v in params.items()])
            print(f"\n# {item['name']}")
            print(f"{BASE_URL}/{item['endpoint']}?{params_str}")

if __name__ == "__main__":
    main()
