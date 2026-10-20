#!/usr/bin/env python3
"""判断 daily.json 有多旧，给 workflow 的「daily 陈旧兜底」用。

背景（2026-10-20）：底部趋势图的历史点只来自 daily.json，而它由 workflow 里
`0 18 * * *` 那条**内置 cron** 每天抓一次。这个仓库的内置 cron 经常不触发
（10-14 停过 4 天，10-18 之后又停了 2 天），一停就出现「18 号有业绩但图上几乎是 0」
「19 号整条平在 0」——其实不是没业绩，是数据没抓到。

用法：
    python3 scripts/daily_age.py [阈值小时数，默认 20]

输出（一行，给 shell 截取）：
    stale|updated_at=2026-10-18 10:34，48.6 小时前
    fresh|updated_at=2026-10-20 11:06，0.1 小时前
读不到文件/字段时也算 stale —— 宁可多抓一次，也别让看板断数。
"""

import datetime
import json
import os
import sys

PATH = os.path.join(os.path.dirname(__file__), "..", "site", "data", "daily.json")
BJ = datetime.timedelta(hours=8)  # updated_at 写的是北京时间


def main() -> int:
    hours = float(sys.argv[1]) if len(sys.argv) > 1 else 20.0
    try:
        with open(PATH, encoding="utf-8") as f:
            ts = json.load(f)["updated_at"]
        last = datetime.datetime.strptime(ts, "%Y-%m-%d %H:%M")
    except Exception as e:  # 文件缺失 / 字段缺失 / 格式变了
        print("stale|读不到 daily.json 的 updated_at（%s）" % e)
        return 0

    now = datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None) + BJ
    age = (now - last).total_seconds() / 3600
    print("%s|updated_at=%s，%.1f 小时前" % ("stale" if age > hours else "fresh", ts, age))
    return 0


if __name__ == "__main__":
    sys.exit(main())
