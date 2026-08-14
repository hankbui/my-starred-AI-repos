#!/usr/bin/env python3
"""
Discover Telegram forum topic IDs (message_thread_id) for a channel.

Telegram has no API to list a channel's topics, so we read them from
incoming messages. Run this script, then post one short, UNIQUE message
in EACH topic of the channel (e.g. the letter "a", "b", "c" ... in order).
The script waits and prints each topic's message_thread_id so you can map
them to the daily digest sections.

Usage:
  TELEGRAM_BOT_TOKEN=... TELEGRAM_CHANNEL=@ai_repos_daily \
      python scripts/telegram_topics.py

After running, put the mapping into a GitHub secret named TG_THREADS as JSON:
  {"github":"12","hf":"13","report":"14","ideas":"15","automation":"16",
   "agentskills":"17","techradar":"18"}
Keys:
  github       -> top GitHub repos + Product Hunt
  hf           -> Hugging Face daily
  report       -> AI Opportunity Report + PDF attachment
  ideas        -> startup ideas
  automation   -> automation radar
  agentskills  -> agents & skills
  techradar    -> tech radar
Messages without a key (header/footer) go to the General topic.
"""

import json
import os
import sys
import time

import requests

TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
CHANNEL = os.getenv("TELEGRAM_CHANNEL", "").strip()
API = "https://api.telegram.org/bot{token}/{method}"

KNOWN_SECTIONS = {
    "github": "⭐ Top GitHub repos + Product Hunt",
    "hf": "🧠 Hugging Face daily",
    "report": "📈 Market report + PDF",
    "ideas": "💡 Startup ideas",
    "automation": "⚙️ Automation radar",
    "agentskills": "🤖 Agents & skills",
    "techradar": "🛰️ Tech radar",
}


def main():
    if not TOKEN or not CHANNEL:
        raise SystemExit("TELEGRAM_BOT_TOKEN and TELEGRAM_CHANNEL are required")

    print("=" * 60)
    print("1) Make sure your channel has Topics enabled:")
    print("   Edit channel -> Channel type -> Topics: ON")
    print("2) Create one topic per digest section:")
    for key, label in KNOWN_SECTIONS.items():
        print(f"   - {key:12s} = {label}")
    print("3) In each topic, post a SHORT UNIQUE message now, e.g. 'a', 'b', 'c' ...")
    print("   (in the same order as you want the mapping printed below)")
    print("=" * 60)

    offset = 0
    deadline = time.time() + 90
    found = {}
    while time.time() < deadline:
        try:
            resp = requests.get(
                API.format(token=TOKEN, method="getUpdates"),
                params={"timeout": 30, "offset": offset},
                timeout=35,
            )
            data = resp.json()
            if not data.get("ok"):
                print(f"getUpdates error: {data.get('description')}")
                break
            updates = data["result"]
        except Exception as exc:  # noqa: BLE001
            print(f"getUpdates failed: {exc}")
            time.sleep(3)
            continue

        for update in updates:
            offset = update["update_id"] + 1
            msg = update.get("channel_post") or update.get("message")
            if not msg:
                continue
            chat_id = msg.get("chat", {}).get("id")
            thread_id = msg.get("message_thread_id")
            text = str(msg.get("text") or msg.get("caption") or "")[:20]
            if chat_id != CHANNEL:
                continue
            if thread_id is None:
                print(f"   [general]  (no thread id)  text={text!r}")
                continue
            marker = text.strip() or "(empty)"
            if marker not in found:
                found[marker] = thread_id
                print(f"   marker {marker!r} -> message_thread_id = {thread_id}")

    print("=" * 60)
    if not found:
        print("No topic messages received. Post a message in each topic and re-run.")
        return

    print("Paste this as the GitHub secret TG_THREADS (map each marker to a section):")
    print()
    ordered = {}
    for marker, thread_id in found.items():
        print(f"   marker {marker!r} -> {thread_id}")
    print()
    print("Example TG_THREADS value:")
    print("  {\"github\":\"<id>\",\"hf\":\"<id>\",\"report\":\"<id>\",\"ideas\":\"<id>\","
          "\"automation\":\"<id>\",\"agentskills\":\"<id>\",\"techradar\":\"<id>\"}")


if __name__ == "__main__":
    main()