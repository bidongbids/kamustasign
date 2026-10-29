"""
PDF report of the per-word diagnostics written by word_model_diagnostics.py
(models/diagnostics/{asl,fsl-105}_per_word.csv + summary.json).

  cd ml
  .\venv\Scripts\Activate.ps1
  python scripts/word_model_diagnostics.py
  python scripts/word_diagnostics_report.py

Writes models/diagnostics/word_accuracy_report.pdf: a summary page, charts
and confusions per model, then every word's row, best to worst.
"""

import os
import csv
import json
import math
import datetime
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.backends.backend_pdf import PdfPages

ML_DIR = os.path.join(os.path.dirname(__file__), "..")
DIAG_DIR = os.path.join(ML_DIR, "models", "diagnostics")
OUT = os.path.join(DIAG_DIR, "word_accuracy_report.pdf")

PAGE = (8.5, 11)
ROWS_PER_PAGE = 46
INK, MUTED, ACCENT = "#1f2933", "#616e7c", "#3b5bdb"
GOOD, MID, BAD = "#d3f9d8", "#fff3bf", "#ffe3e3"

MODELS = [
    ("ASL words", "asl_per_word.csv",
     "Test set: our manifest's test split + 2 held-out signers from Google Isolated SLR."),
    ("FSL-105 (signer D held out)", "fsl-105_per_word.csv",
     "Test set: every clip from signer D, who is never seen in training. Words in Tagalog, as the app shows them."),
]


def num(v):
    try:
        f = float(v)
        return None if math.isnan(f) else f
    except ValueError:
        return None


def load_rows(name):
    with open(os.path.join(DIAG_DIR, name), encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    for r in rows:
        for k in ("top1", "top5", "precision", "f1", "conf_when_right", "conf_when_wrong"):
            r[k] = num(r[k])
        for k in ("train_clips", "test_clips", "shown", "shown_ok", "times_predicted"):
            r[k] = int(r[k])
        r["name"] = r.get("name") or r["word"]  # the shown name (Tagalog for FSL); word is the key
    return rows


def pct(v):
    return "-" if v is None else f"{v:.0%}"


def shrink_to_fit(tb, col, chars):
    """Smaller type for the cells in `col` longer than `chars` characters, so
    a long name (Tagalog FSL words such as "ikinagagalak kitang makilala")
    stays inside its cell."""
    for (row, c), cell in tb.get_celld().items():
        text = cell.get_text()
        if row and c == col and len(text.get_text()) > chars:
            text.set_fontsize(text.get_fontsize() * chars / len(text.get_text()))


def new_page(pdf_pages, title, subtitle=None):
    fig = plt.figure(figsize=PAGE)
    fig.text(0.07, 0.955, title, fontsize=16, weight="bold", color=INK)
    if subtitle:
        fig.text(0.07, 0.932, subtitle, fontsize=9, color=MUTED)
    return fig


def footer(fig, n):
    fig.text(0.5, 0.025, f"KamustaSign word model diagnostics  ·  page {n}", ha="center", fontsize=7, color=MUTED)


def summary_page(pdf, summaries, page_no):
    fig = new_page(pdf, "Word Model Accuracy Report",
                   f"Generated {datetime.date.today():%B %d, %Y}  ·  ensembles of {summaries[0]['seeds']} seeds, "
                   f"scored on held-out test sets")
    cols = ["", *[s["model"].split(" (")[0] for s in summaries]]
    lines = [
        ("Words", lambda s: f"{s['words']}"),
        ("Test clips", lambda s: f"{s['test_clips']:,}"),
        ("Top-1 accuracy (all clips)", lambda s: pct(s["top1"])),
        ("Top-5 accuracy", lambda s: pct(s["top5"])),
        ("Macro top-1 (mean over words)", lambda s: pct(s["macro_top1"])),
        ("Macro F1", lambda s: pct(s["macro_f1"])),
        (f"Clips shown at the {summaries[0]['gate']:.0%} gate", lambda s: pct(s["shown_rate"])),
        ("Shown words that are correct", lambda s: pct(s["precision_when_shown"])),
        ("Mean confidence when right", lambda s: pct(s["mean_conf_right"])),
        ("Mean confidence when wrong", lambda s: pct(s["mean_conf_wrong"])),
        ("Words at 100%", lambda s: f"{s['words_100']}"),
        ("Words at 80% or better", lambda s: f"{s['words_ge_80']}"),
        ("Words below 50%", lambda s: f"{s['words_lt_50']}"),
        ("Words at 0%", lambda s: f"{s['words_0']}"),
    ]
    ax = fig.add_axes([0.07, 0.48, 0.86, 0.42])
    ax.axis("off")
    t = ax.table(cellText=[[label, *[f(s) for s in summaries]] for label, f in lines],
                 colLabels=cols, colWidths=[0.46, 0.27, 0.27], loc="upper center", cellLoc="center")
    t.auto_set_font_size(False)
    t.set_fontsize(10)
    t.scale(1, 1.55)
    for (r, c), cell in t.get_celld().items():
        cell.set_edgecolor("#d9e2ec")
        if r == 0:
            cell.set_facecolor(ACCENT)
            cell.set_text_props(color="white", weight="bold")
        elif c == 0:
            cell.set_text_props(ha="left")
            cell._loc = "left"

    notes = (
        "How to read this report\n\n"
        "•  Top-1: the model's single best guess is the right word. Top-5: the right word is among its five best guesses.\n"
        "•  Macro scores average each word equally, so rare words count as much as common ones.\n"
        f"•  The app only shows a word when the ensemble's confidence is at least {summaries[0]['gate']:.0%}\n"
        "   (MIN_CONFIDENCE in WordTranslatorScreen.tsx). 'Shown' and 'shown ok' measure that behaviour.\n"
        "•  Precision: of the times the model predicted this word, how often it was right.\n"
        "•  Most words have only a handful of test clips (FSL: 5-6 each), so a single clip moves a word's score\n"
        "   by 15-20 points. Treat the top and bottom bands as signal and the ordering inside them as noise.\n"
        "•  Test clips come from signers the models never trained on, so these numbers are closer to what a new\n"
        "   user sees than training accuracy is. Webcam framing and lighting in the app can lower them further."
    )
    fig.text(0.07, 0.5, notes, fontsize=8.6, color=INK, va="top", linespacing=1.55)
    footer(fig, page_no)
    pdf.savefig(fig)
    plt.close(fig)


def charts_page(pdf, title, note, rows, summary, page_no):
    fig = new_page(pdf, title, note)

    ax = fig.add_axes([0.09, 0.66, 0.38, 0.24])
    t1 = [r["top1"] for r in rows]
    bins = [i / 10 for i in range(11)]
    _, _, patches = ax.hist(t1, bins=bins, color=ACCENT, edgecolor="white")
    for p, left in zip(patches, bins):
        p.set_facecolor("#e03131" if left < 0.5 else "#f59f00" if left < 0.8 else "#2f9e44")
    ax.set_title("Words by top-1 accuracy", fontsize=10, loc="left")
    ax.set_xlabel("top-1 accuracy", fontsize=8)
    ax.set_ylabel("words", fontsize=8)
    ax.xaxis.set_major_formatter(lambda v, _: f"{v:.0%}")
    ax.tick_params(labelsize=7)
    ax.spines[["top", "right"]].set_visible(False)

    ax = fig.add_axes([0.57, 0.66, 0.36, 0.24])
    ax.scatter([r["train_clips"] for r in rows], t1, s=10, alpha=0.5, color=ACCENT, edgecolors="none")
    ax.set_title("Training clips vs. top-1", fontsize=10, loc="left")
    ax.set_xlabel("training clips for the word", fontsize=8)
    ax.set_ylabel("top-1 accuracy", fontsize=8)
    ax.yaxis.set_major_formatter(lambda v, _: f"{v:.0%}")
    ax.tick_params(labelsize=7)
    ax.spines[["top", "right"]].set_visible(False)

    ranked = sorted(rows, key=lambda r: (-r["top1"], -(r["f1"] or 0), r["name"]))
    best, worst = ranked[:12], ranked[::-1][:12]

    def mini(x, title_, items):
        ax = fig.add_axes([x, 0.31, 0.38, 0.27])
        ax.axis("off")
        ax.set_title(title_, fontsize=10, loc="left")
        tb = ax.table(cellText=[[r["name"], pct(r["top1"]), r["most_confused_with"] or "-"] for r in items],
                      colLabels=["word", "top-1", "most confused with"], colWidths=[0.42, 0.14, 0.44],
                      loc="upper left", cellLoc="left")
        tb.auto_set_font_size(False)
        tb.set_fontsize(7.5)
        shrink_to_fit(tb, 0, 21)
        shrink_to_fit(tb, 2, 22)
        tb.scale(1, 1.25)
        for (r, _), cell in tb.get_celld().items():
            cell.set_edgecolor("#d9e2ec")
            if r == 0:
                cell.set_facecolor("#f0f4f8")
                cell.set_text_props(weight="bold")

    mini(0.07, "Strongest words", best)
    mini(0.55, "Weakest words", worst)

    ax = fig.add_axes([0.07, 0.06, 0.86, 0.2])
    ax.axis("off")
    ax.set_title("Most frequent confusions across the test set (true → predicted)", fontsize=10, loc="left")
    conf = summary["top_confusions"][:15]
    half = math.ceil(len(conf) / 2)
    cells = []
    for i in range(half):
        row = []
        for c in (conf[i], conf[i + half] if i + half < len(conf) else None):
            row += [f"{c['true']}  →  {c['pred']}", f"×{c['count']}"] if c else ["", ""]
        cells.append(row)
    tb = ax.table(cellText=cells, colWidths=[0.38, 0.1, 0.38, 0.1], loc="upper left", cellLoc="left")
    tb.auto_set_font_size(False)
    tb.set_fontsize(8)
    tb.scale(1, 1.2)
    for cell in tb.get_celld().values():
        cell.set_edgecolor("#d9e2ec")

    footer(fig, page_no)
    pdf.savefig(fig)
    plt.close(fig)


def table_pages(pdf, title, rows, page_no):
    ranked = sorted(rows, key=lambda r: (-r["top1"], -(r["f1"] or 0), r["name"]))
    header = ["#", "word", "train", "test", "top-1", "top-5", "prec.", "F1",
              "conf. right", "conf. wrong", "shown ok", "most confused with"]
    widths = [0.04, 0.17, 0.06, 0.05, 0.065, 0.065, 0.065, 0.065, 0.08, 0.08, 0.075, 0.2]
    pages = math.ceil(len(ranked) / ROWS_PER_PAGE)
    for p in range(pages):
        chunk = ranked[p * ROWS_PER_PAGE:(p + 1) * ROWS_PER_PAGE]
        fig = new_page(pdf, f"{title}: every word", f"Sorted by top-1, then F1  ·  part {p + 1} of {pages}  ·  "
                       "shown ok = clips shown at the gate and correct / clips shown")
        ax = fig.add_axes([0.04, 0.05, 0.92, 0.86])
        ax.axis("off")
        cells = [[str(p * ROWS_PER_PAGE + i + 1), r["name"], r["train_clips"], r["test_clips"], pct(r["top1"]),
                  pct(r["top5"]), pct(r["precision"]), pct(r["f1"]), pct(r["conf_when_right"]),
                  pct(r["conf_when_wrong"]), f"{r['shown_ok']}/{r['shown']}", r["most_confused_with"] or ""]
                 for i, r in enumerate(chunk)]
        tb = ax.table(cellText=cells, colLabels=header, colWidths=widths, loc="upper center", cellLoc="center")
        tb.auto_set_font_size(False)
        tb.set_fontsize(6.8)
        shrink_to_fit(tb, 1, 22)
        shrink_to_fit(tb, 11, 26)
        tb.scale(1, 1.12)
        for (ri, ci), cell in tb.get_celld().items():
            cell.set_edgecolor("#e4e7eb")
            if ri == 0:
                cell.set_facecolor(ACCENT)
                cell.set_text_props(color="white", weight="bold")
                continue
            if ci in (1, 11):
                cell._loc = "left"
            if ci == 4:
                v = chunk[ri - 1]["top1"]
                cell.set_facecolor(GOOD if v >= 0.8 else MID if v >= 0.5 else BAD)
        footer(fig, page_no)
        pdf.savefig(fig)
        plt.close(fig)
        page_no += 1
    return page_no


def main():
    summaries = json.load(open(os.path.join(DIAG_DIR, "summary.json"), encoding="utf-8"))
    by_name = {s["model"]: s for s in summaries}
    plt.rcParams["font.family"] = "DejaVu Sans"
    with PdfPages(OUT) as pdf:
        page = 1
        summary_page(pdf, summaries, page)
        page += 1
        for name, csv_name, note in MODELS:
            if name not in by_name:
                continue
            rows = load_rows(csv_name)
            charts_page(pdf, name, note, rows, by_name[name], page)
            page = table_pages(pdf, name, rows, page + 1)
        info = pdf.infodict()
        info["Title"] = "KamustaSign word model accuracy report"
    print(f"Wrote {os.path.abspath(OUT)} ({page - 1} pages)")


if __name__ == "__main__":
    main()
