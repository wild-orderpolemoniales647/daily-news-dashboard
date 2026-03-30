from flask import Flask, jsonify, send_from_directory
import requests
import json
import os
import schedule
import time
import threading
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv

load_dotenv()

try:
    from openai import OpenAI  # optional
except ImportError:
    OpenAI = None

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
client = OpenAI(api_key=OPENAI_API_KEY) if (OpenAI and OPENAI_API_KEY) else None

app = Flask(__name__)

NEWS_API_KEY = os.getenv("NEWS_API_KEY")
FINNHUB_API_KEY = os.getenv("FINNHUB_API_KEY")
METAL_API_KEY = os.getenv("METAL_API_KEY")

def run_scheduler():
    schedule.every().day.at("05:00").do(update_data)

    while True:
        schedule.run_pending()
        time.sleep(60)
# 📰 NEWS
def fetch_news():
    try:
        PER_CATEGORY_LIMIT = 10
        MAX_NEWS_ITEMS = 24
        news = []
        seen_titles = set()
        since_iso = (datetime.now(timezone.utc) - timedelta(hours=45)).isoformat(timespec="seconds")
        since_5h_iso = (datetime.now(timezone.utc) - timedelta(hours=5)).isoformat(timespec="seconds")

        def add_article(article, news_type):
            title = (article.get("title") or "").strip()
            if not title:
                return

            normalized = title.lower()
            if normalized in seen_titles:
                return
            seen_titles.add(normalized)

            news.append({
                "title": title,
                "desc": article.get("description"),
                "img": article.get("urlToImage"),
                "type": news_type,
                "publishedAt": article.get("publishedAt"),
                "priority": 1 if any(word in normalized for word in ["war", "attack", "crash", "election", "explosion", "strike", "breaking"]) else 2,
            })

        # 🌍 GLOBAL NEWS - last 45 hours
        global_url = (
            "https://newsapi.org/v2/everything"
            f"?q=(breaking OR world OR global OR economy OR markets)"
            f"&language=en&sortBy=publishedAt&from={since_iso}&apiKey={NEWS_API_KEY}"
        )
        global_res = requests.get(global_url, timeout=5).json()

        for a in global_res.get("articles", [])[:PER_CATEGORY_LIMIT]:
            add_article(a, "Global")

        # 🇮🇳 INDIA NEWS - last 45 hours
        india_url = (
            "https://newsapi.org/v2/everything"
            f"?q=(India OR Indian) AND (breaking OR latest OR politics OR economy)"
            f"&language=en&sortBy=publishedAt&from={since_iso}&apiKey={NEWS_API_KEY}"
        )
        india_res = requests.get(india_url, timeout=5).json()

        for a in india_res.get("articles", [])[:PER_CATEGORY_LIMIT]:
            add_article(a, "India")

        # 🏙 TAMIL NADU NEWS - last 45 hours
        tn_url = (
            "https://newsapi.org/v2/everything"
            f"?q=(\"Tamil Nadu\" OR Chennai OR Coimbatore OR Madurai)"
            f"&language=en&sortBy=publishedAt&from={since_iso}&apiKey={NEWS_API_KEY}"
        )
        tn_res = requests.get(tn_url, timeout=5).json()

        for a in tn_res.get("articles", [])[:PER_CATEGORY_LIMIT]:
            add_article(a, "Tamil Nadu")

        # 🔴 LIVE LAST 5 HOURS (breaking + latest)
        live_url = (
            "https://newsapi.org/v2/everything"
            f"?q=(breaking OR live OR latest OR urgent)"
            f"&language=en&sortBy=publishedAt&from={since_5h_iso}&apiKey={NEWS_API_KEY}"
        )
        live_res = requests.get(live_url, timeout=5).json()
        for a in live_res.get("articles", [])[:PER_CATEGORY_LIMIT]:
            add_article(a, "Live")

        # Show newest first, and keep breaking/high-priority at top.
        news.sort(key=lambda n: n.get("publishedAt") or "", reverse=True)
        news.sort(key=lambda n: n.get("priority", 2))
        return news[:MAX_NEWS_ITEMS]

    except Exception as e:
        print("News error:", e)
        return []
# 📈 STOCK MARKET
def fetch_market():
    try:
        url = f"https://finnhub.io/api/v1/quote?symbol=AAPL&token={FINNHUB_API_KEY}"
        res = requests.get(url, timeout=5).json()

        return {
            "current": res.get("c"),
            "high": res.get("h"),
            "low": res.get("l")
        }
    except Exception as e:
        print("Market error:", e)
        return {}

# 🪙 GOLD + SILVER
def fetch_gold():
    try:
        url = f"https://api.metalpriceapi.com/v1/latest?api_key={METAL_API_KEY}&base=INR&currencies=XAU,XAG"
        res = requests.get(url, timeout=5).json()

        rates = res.get("rates", {})
        gold_rate = rates.get("XAU")
        silver_rate = rates.get("XAG")

        if not gold_rate or not silver_rate:
            return {"gold": "—", "silver": "—"}

        gold_per_ounce = 1 / gold_rate
        silver_per_ounce = 1 / silver_rate

        gold_10g = (gold_per_ounce / 31.1035) * 10
        silver_10g = (silver_per_ounce / 31.1035) * 10

        return {
            "gold": f"₹{round(gold_10g, 2)} / 10g",
            "silver": f"₹{round(silver_10g, 2)} / 10g"
        }

    except Exception as e:
        print("Metal error:", e)
        return {"gold": "—", "silver": "—"}

# 🤖 AI SUMMARY
def generate_summary(news):
    if not news:
        return "No major updates."

    headlines = "\n".join([n["title"] for n in news])

    prompt = f"""
You are a financial intelligence assistant.

Analyze these news headlines and give:
1. Global risk level (Low/Medium/High)
2. Market sentiment (Bullish/Bearish/Neutral)
3. Gold trend
4. One-line insight

News:
{headlines}
"""

    if not client:
        return f"{news[0].get('title', 'Top story')}"

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
        )
        return response.choices[0].message.content
    except Exception as e:
        # Covers quota/rate-limit/network issues; keep the app running.
        print("AI summary error:", e)
        return f"{news[0].get('title', 'Top story')}"
# 🔄 UPDATE DATA
def update_data():
    news = fetch_news()
    market = fetch_market()
    metals = fetch_gold()
    now_utc = datetime.now(timezone.utc)

    def parse_iso_utc(value):
        if not value:
            return None
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None

    live_last_5h = []
    for item in news:
        published = parse_iso_utc(item.get("publishedAt"))
        if published and (now_utc - published) <= timedelta(hours=5):
            live_last_5h.append(item)

    data = {
        "news": news,
        "live_last_5h": live_last_5h,
        "summary": generate_summary(news),
        "market": market,
        "gold": metals["gold"],
        "silver": metals["silver"]
    }

    with open("data.json", "w") as f:
        json.dump(data, f)

# 🌐 FRONTEND
@app.route("/")
def home():
    return send_from_directory(".", "index.html")

@app.route("/<path:path>")
def static_files(path):
    return send_from_directory(".", path)

# 🌐 API
@app.route("/api/data")
def api_get_data():
    # Keep news relatively fresh even when scheduler hasn't run yet.
    should_refresh = True
    if os.path.exists("data.json"):
        modified_at = datetime.fromtimestamp(os.path.getmtime("data.json"), tz=timezone.utc)
        should_refresh = (datetime.now(timezone.utc) - modified_at) > timedelta(minutes=10)

    if should_refresh:
        update_data()

    with open("data.json") as f:
        return jsonify(json.load(f))

@app.route("/data")
def get_data():
    with open("data.json") as f:
        return jsonify(json.load(f))

# 🚀 RUN
if __name__ == "__main__":
    update_data()

    # Run scheduler in background thread
    threading.Thread(target=run_scheduler, daemon=True).start()

    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)), debug=True)