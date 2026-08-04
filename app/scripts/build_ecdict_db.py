#!/usr/bin/env python3
"""将 ECDICT 全量 CSV + lemma.en.txt 构建为 SQLite，供 App 打包。

用法:
  python scripts/build_ecdict_db.py
  python scripts/build_ecdict_db.py --csv PATH --lemma PATH --out PATH

环境变量:
  ECDICT_CSV / ECDICT_LEMMA / ECDICT_OUT
"""

from __future__ import annotations

import argparse
import csv
import os
import re
import sqlite3
import sys
import time
from pathlib import Path

# 提升超大字段行
csv.field_size_limit(min(sys.maxsize, 2**31 - 1))

DEFAULT_CSV = Path(
    r"C:\Users\v_dcganluo\Downloads\ECDICT-master\ECDICT-master\ecdict.csv"
)
DEFAULT_LEMMA = Path(
    r"C:\Users\v_dcganluo\Downloads\ECDICT-master\ECDICT-master\lemma.en.txt"
)

SCRIPT_DIR = Path(__file__).resolve().parent
APP_DIR = SCRIPT_DIR.parent
DEFAULT_OUT = APP_DIR / "public" / "dict" / "ecdict.db"

BATCH = 5000


def stripword(word: str) -> str:
    return "".join(ch for ch in word if ch.isalnum()).lower()


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Build ECDICT SQLite database")
    p.add_argument("--csv", type=Path, default=Path(os.environ.get("ECDICT_CSV", DEFAULT_CSV)))
    p.add_argument(
        "--lemma", type=Path, default=Path(os.environ.get("ECDICT_LEMMA", DEFAULT_LEMMA))
    )
    p.add_argument("--out", type=Path, default=Path(os.environ.get("ECDICT_OUT", DEFAULT_OUT)))
    return p.parse_args()


def create_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        PRAGMA journal_mode = OFF;
        PRAGMA synchronous = OFF;
        PRAGMA temp_store = MEMORY;
        PRAGMA locking_mode = EXCLUSIVE;

        DROP TABLE IF EXISTS ecdict;
        DROP TABLE IF EXISTS lemma_map;
        DROP TABLE IF EXISTS meta;

        CREATE TABLE ecdict (
          word TEXT NOT NULL COLLATE NOCASE,
          phonetic TEXT NOT NULL DEFAULT '',
          definition TEXT NOT NULL DEFAULT '',
          translation TEXT NOT NULL DEFAULT '',
          pos TEXT NOT NULL DEFAULT '',
          collins INTEGER NOT NULL DEFAULT 0,
          oxford INTEGER NOT NULL DEFAULT 0,
          tag TEXT NOT NULL DEFAULT '',
          bnc INTEGER NOT NULL DEFAULT 0,
          frq INTEGER NOT NULL DEFAULT 0,
          exchange TEXT NOT NULL DEFAULT '',
          detail TEXT NOT NULL DEFAULT '',
          audio TEXT NOT NULL DEFAULT '',
          sw TEXT NOT NULL DEFAULT '',
          PRIMARY KEY (word)
        ) WITHOUT ROWID;

        CREATE INDEX idx_ecdict_sw ON ecdict(sw);

        CREATE TABLE lemma_map (
          form TEXT NOT NULL COLLATE NOCASE,
          lemma TEXT NOT NULL,
          PRIMARY KEY (form)
        ) WITHOUT ROWID;

        CREATE TABLE meta (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );
        """
    )


def to_int(raw: str | None) -> int:
    if raw is None:
        return 0
    s = str(raw).strip()
    if not s:
        return 0
    try:
        return int(float(s))
    except ValueError:
        return 0


def import_csv(conn: sqlite3.Connection, csv_path: Path) -> int:
    insert_sql = """
      INSERT OR REPLACE INTO ecdict (
        word, phonetic, definition, translation, pos,
        collins, oxford, tag, bnc, frq, exchange, detail, audio, sw
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """
    count = 0
    batch: list[tuple] = []

    with csv_path.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        expected = {
            "word",
            "phonetic",
            "definition",
            "translation",
            "pos",
            "collins",
            "oxford",
            "tag",
            "bnc",
            "frq",
            "exchange",
            "detail",
            "audio",
        }
        if not reader.fieldnames or not expected.issubset(set(reader.fieldnames)):
            raise SystemExit(f"CSV 表头不符合 ECDICT: {reader.fieldnames}")

        for row in reader:
            word = (row.get("word") or "").strip()
            if not word:
                continue
            batch.append(
                (
                    word,
                    row.get("phonetic") or "",
                    row.get("definition") or "",
                    row.get("translation") or "",
                    row.get("pos") or "",
                    to_int(row.get("collins")),
                    to_int(row.get("oxford")),
                    row.get("tag") or "",
                    to_int(row.get("bnc")),
                    to_int(row.get("frq")),
                    row.get("exchange") or "",
                    row.get("detail") or "",
                    row.get("audio") or "",
                    stripword(word),
                )
            )
            if len(batch) >= BATCH:
                conn.executemany(insert_sql, batch)
                count += len(batch)
                batch.clear()
                if count % 100000 == 0:
                    print(f"  ... ecdict rows {count}", flush=True)

        if batch:
            conn.executemany(insert_sql, batch)
            count += len(batch)

    return count


LEMMA_LINE = re.compile(r"^([^/]+)/(\d+)\s*->\s*(.+)$")


def import_lemma(conn: sqlite3.Connection, lemma_path: Path) -> int:
    """lemma.en.txt: lemma/freq -> form1,form2,...

    同一 form 出现多次时，保留频次更高的原型映射（避免 told/21 覆盖 tell→told）。
    """
    if not lemma_path.is_file():
        print(f"警告: 未找到 lemma 文件 {lemma_path}，跳过 lemma_map")
        return 0

    entries: list[tuple[int, str, list[str]]] = []
    with lemma_path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith(";"):
                continue
            m = LEMMA_LINE.match(line)
            if not m:
                continue
            lemma = m.group(1).strip().lower()
            freq = int(m.group(2))
            forms = [p.strip().lower() for p in m.group(3).split(",") if p.strip()]
            if lemma:
                entries.append((freq, lemma, forms))

    # 高频优先写入；OR IGNORE 保证不被低频脏数据覆盖
    entries.sort(key=lambda item: item[0], reverse=True)

    insert_sql = "INSERT OR IGNORE INTO lemma_map (form, lemma) VALUES (?, ?)"
    count = 0
    batch: list[tuple[str, str]] = []

    for _freq, lemma, forms in entries:
        batch.append((lemma, lemma))
        for form in forms:
            if not form or form == lemma:
                continue
            batch.append((form, lemma))
        if len(batch) >= BATCH:
            conn.executemany(insert_sql, batch)
            count += len(batch)
            batch.clear()

    if batch:
        conn.executemany(insert_sql, batch)
        count += len(batch)
    return count


def import_exchange_lemmas(conn: sqlite3.Connection) -> int:
    """从 exchange 字段的 0:lemma 补全 lemma_map。"""
    rows = conn.execute(
        "SELECT word, exchange FROM ecdict WHERE exchange LIKE '%0:%'"
    ).fetchall()
    batch: list[tuple[str, str]] = []
    for word, exchange in rows:
        if not exchange:
            continue
        for part in str(exchange).split("/"):
            part = part.strip()
            if not part.startswith("0:"):
                continue
            lemma = part[2:].strip().lower()
            form = str(word).strip().lower()
            if lemma and form and form != lemma:
                batch.append((form, lemma))
    if not batch:
        return 0
    conn.executemany(
        "INSERT OR IGNORE INTO lemma_map (form, lemma) VALUES (?, ?)", batch
    )
    return len(batch)


def main() -> None:
    args = parse_args()
    csv_path: Path = args.csv
    lemma_path: Path = args.lemma
    out_path: Path = args.out

    if not csv_path.is_file():
        raise SystemExit(
            f"找不到 CSV: {csv_path}\n"
            "请传入 --csv，或设置环境变量 ECDICT_CSV"
        )

    out_path.parent.mkdir(parents=True, exist_ok=True)
    if out_path.exists():
        out_path.unlink()

    print(f"CSV : {csv_path} ({csv_path.stat().st_size / 1e6:.1f} MB)")
    print(f"Lemma: {lemma_path}")
    print(f"Out : {out_path}")
    t0 = time.time()

    conn = sqlite3.connect(str(out_path))
    try:
        create_schema(conn)
        print("导入 ecdict.csv ...")
        n_words = import_csv(conn, csv_path)
        print(f"  词条 {n_words}")
        print("导入 lemma.en.txt ...")
        n_lemma = import_lemma(conn, lemma_path)
        print(f"  lemma_map 行 {n_lemma}")
        print("从 exchange 补全 lemma ...")
        n_ex = import_exchange_lemmas(conn)
        print(f"  exchange 补全 {n_ex}")

        conn.execute(
            "INSERT INTO meta(key, value) VALUES (?, ?)",
            ("source", "ECDICT"),
        )
        conn.execute(
            "INSERT INTO meta(key, value) VALUES (?, ?)",
            ("word_count", str(n_words)),
        )
        conn.execute(
            "INSERT INTO meta(key, value) VALUES (?, ?)",
            ("built_at", str(int(time.time()))),
        )
        conn.commit()
        print("VACUUM ...")
        conn.execute("VACUUM")
        conn.commit()
    finally:
        conn.close()

    size_mb = out_path.stat().st_size / 1e6
    print(f"完成: {out_path} ({size_mb:.1f} MB), 耗时 {time.time() - t0:.1f}s")


if __name__ == "__main__":
    main()
