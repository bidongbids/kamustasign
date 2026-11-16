# Yourdon/DeMarco DFDs for the LCSign manuscript (Figures 9-12).
# Processes = circles (number + name), terminators = rectangles, data
# stores = two parallel lines, data flows = curved, labelled arrows.
# Writes fig9.svg ... fig12.svg; render.js turns them into PNGs.
import math
import sys
from html import escape

W = 1100  # canvas width in units; printed 6.0 in wide (1 unit ~ 0.39 pt)
FONT = "Arial, Helvetica, sans-serif"
SHAPE_PT = 22
LABEL_PT = 20
STROKE = 2.2


class Circle:
    def __init__(self, cx, cy, r, number, name):
        self.cx, self.cy, self.r, self.number, self.name = cx, cy, r, number, name

    def at(self, deg):
        a = math.radians(deg)
        return (self.cx + self.r * math.cos(a), self.cy + self.r * math.sin(a))

    def svg(self):
        lines = ([self.number] if self.number else []) + self.name.split("\n")
        lh = SHAPE_PT * 1.18
        y0 = self.cy - (len(lines) - 1) * lh / 2 + SHAPE_PT * 0.35
        out = [f'<circle cx="{self.cx}" cy="{self.cy}" r="{self.r}" fill="#fff" stroke="#000" stroke-width="{STROKE}"/>']
        for i, t in enumerate(lines):
            weight = "bold" if (i == 0 and self.number) else "normal"
            out.append(f'<text x="{self.cx}" y="{y0 + i * lh:.1f}" text-anchor="middle" font-size="{SHAPE_PT}" font-weight="{weight}">{escape(t)}</text>')
        return "\n".join(out)


class Rect:
    def __init__(self, x, y, w, h, name):
        self.x, self.y, self.w, self.h, self.name = x, y, w, h, name

    def at(self, side, f=0.5):
        if side == "top":
            return (self.x + self.w * f, self.y)
        if side == "bottom":
            return (self.x + self.w * f, self.y + self.h)
        if side == "left":
            return (self.x, self.y + self.h * f)
        return (self.x + self.w, self.y + self.h * f)

    def svg(self):
        lines = self.name.split("\n")
        lh = SHAPE_PT * 1.18
        cy = self.y + self.h / 2
        y0 = cy - (len(lines) - 1) * lh / 2 + SHAPE_PT * 0.35
        out = [f'<rect x="{self.x}" y="{self.y}" width="{self.w}" height="{self.h}" fill="#fff" stroke="#000" stroke-width="{STROKE}"/>']
        for i, t in enumerate(lines):
            out.append(f'<text x="{self.x + self.w / 2}" y="{y0 + i * lh:.1f}" text-anchor="middle" font-size="{SHAPE_PT}" font-weight="bold">{escape(t)}</text>')
        return "\n".join(out)


class Store(Rect):
    """Yourdon data store: two parallel horizontal lines, open at both ends."""

    def __init__(self, x, y, w, sid, name, h=48):
        super().__init__(x, y, w, h, name)
        self.sid = sid

    def svg(self):
        y1, y2 = self.y, self.y + self.h
        ty = self.y + self.h / 2 + SHAPE_PT * 0.35
        return "\n".join(
            [
                f'<rect x="{self.x}" y="{y1}" width="{self.w}" height="{self.h}" fill="#fff" stroke="none"/>',
                f'<line x1="{self.x}" y1="{y1}" x2="{self.x + self.w}" y2="{y1}" stroke="#000" stroke-width="{STROKE}"/>',
                f'<line x1="{self.x}" y1="{y2}" x2="{self.x + self.w}" y2="{y2}" stroke="#000" stroke-width="{STROKE}"/>',
                f'<text x="{self.x + self.w / 2}" y="{ty:.1f}" text-anchor="middle" font-size="{SHAPE_PT}">'
                f'<tspan font-weight="bold">{escape(self.sid)}</tspan>  {escape(self.name)}</text>',
            ]
        )


def bez(p0, c1, c2, p1, t):
    u = 1 - t
    return tuple(u**3 * a + 3 * u * u * t * b + 3 * u * t * t * c + t**3 * d for a, b, c, d in zip(p0, c1, c2, p1))


class Flow:
    """A named data flow from p0 to p1: straight, or curved through `via`
    (quadratic) or c1/c2 (cubic). The label is placed at `lab`."""

    def __init__(self, p0, p1, label, via=None, c1=None, c2=None, lab=None, anchor="middle"):
        self.p0, self.p1, self.label, self.lab, self.anchor = p0, p1, label, lab, anchor
        if via is not None:  # a quadratic curve, as the equivalent cubic
            c1 = (p0[0] + 2 / 3 * (via[0] - p0[0]), p0[1] + 2 / 3 * (via[1] - p0[1]))
            c2 = (p1[0] + 2 / 3 * (via[0] - p1[0]), p1[1] + 2 / 3 * (via[1] - p1[1]))
        self.c1, self.c2 = c1, c2

    def svg(self):
        p0, p1 = self.p0, self.p1
        if self.c1 is None:
            d = f"M{p0[0]:.1f},{p0[1]:.1f} L{p1[0]:.1f},{p1[1]:.1f}"
            mid = ((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2)
        else:
            c1, c2 = self.c1, self.c2
            d = f"M{p0[0]:.1f},{p0[1]:.1f} C{c1[0]:.1f},{c1[1]:.1f} {c2[0]:.1f},{c2[1]:.1f} {p1[0]:.1f},{p1[1]:.1f}"
            mid = bez(p0, c1, c2, p1, 0.5)
        out = [f'<path d="{d}" fill="none" stroke="#000" stroke-width="{STROKE}" marker-end="url(#arrow)"/>']
        if self.label:
            x, y = self.lab if self.lab else mid
            lines = self.label.split("\n")
            lh = LABEL_PT * 1.15
            y0 = y - (len(lines) - 1) * lh / 2 + LABEL_PT * 0.35
            for i, t in enumerate(lines):
                out.append(
                    f'<text x="{x:.1f}" y="{y0 + i * lh:.1f}" text-anchor="{self.anchor}" font-size="{LABEL_PT}" font-style="italic" '
                    f'stroke="#fff" stroke-width="6" stroke-linejoin="round" paint-order="stroke">{escape(t)}</text>'
                )
        return "\n".join(out)


def page(h, items, top=0):
    flows = [i for i in items if isinstance(i, Flow)]
    shapes = [i for i in items if not isinstance(i, Flow)]
    # Lines first, then shapes over them, then labels on top.
    flow_svg = [f.svg().split("\n") for f in flows]
    paths = "\n".join(parts[0] for parts in flow_svg)
    labels = "\n".join("\n".join(parts[1:]) for parts in flow_svg)
    body = paths + "\n" + "\n".join(s.svg() for s in shapes) + "\n" + labels
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{h - top}" viewBox="0 {top} {W} {h - top}" font-family="{FONT}">
<defs><marker id="arrow" viewBox="0 0 12 10" refX="11.5" refY="5" markerWidth="13" markerHeight="11" markerUnits="userSpaceOnUse" orient="auto">
<path d="M0,0 L12,5 L0,10 z" fill="#000"/></marker></defs>
<rect y="{top}" width="{W}" height="{h}" fill="#fff"/>
{body}
</svg>"""


# ── Figure 9: Context diagram ────────────────────────────────────────────
def fig9():
    sys_ = Circle(550, 300, 145, "0", "LCSign Real-Time\nSign Language\nInterpretation\nSystem")
    student = Rect(20, 260, 150, 80, "Student")
    teacher = Rect(930, 260, 150, 80, "Teacher")
    admin = Rect(475, 600, 150, 80, "Admin")
    items = [
        sys_, student, teacher, admin,
        Flow(student.at("top", 0.8), sys_.at(215), "Live camera feed,\nassignment submissions", via=(290, 150), lab=(290, 140)),
        Flow(sys_.at(145), student.at("bottom", 0.8), "Real-time translation output,\nassignment feedback", via=(290, 450), lab=(290, 462)),
        Flow(teacher.at("top", 0.2), sys_.at(-35), "Assignments,\ngrading actions", via=(810, 150), lab=(810, 140)),
        Flow(sys_.at(35), teacher.at("bottom", 0.2), "Submissions, auto-generated\nscores, gradebook view", via=(810, 450), lab=(810, 462)),
        Flow(sys_.at(115), admin.at("top", 0.2), "User & class\nrecords", via=(450, 520), lab=(445, 560), anchor="end"),
        Flow(admin.at("top", 0.8), sys_.at(65), "Account & class\nmanagement actions", via=(650, 520), lab=(655, 560), anchor="start"),
    ]
    return page(700, items, top=95)


# ── Figure 10: Real-time translation (1.0-4.0) ─────────────────────────────
def fig10():
    student = Rect(10, 300, 140, 76, "Student")
    p1 = Circle(300, 150, 95, "1.0", "Extract Hand\nLandmarks")
    p2 = Circle(545, 340, 95, "2.0", "Classify\nGesture\n(ASL/FSL)")
    p3 = Circle(790, 150, 95, "3.0", "Translate via\nGoogle API")
    p4 = Circle(980, 360, 95, "4.0", "Render Text/\nSpeech Output")
    d1 = Store(415, 520, 260, "D1", "Trained Model")
    items = [
        student, p1, p2, p3, p4, d1,
        Flow(student.at("top", 0.5), p1.at(185), "Camera frames", via=(85, 150), lab=(122, 268), anchor="start"),
        Flow(p1.at(40), p2.at(215), "21 landmarks\n(x, y, z)", via=(440, 215), lab=(428, 180), anchor="start"),
        Flow(d1.at("top", 0.5), p2.at(90), "Model weights", lab=(557, 478), anchor="start"),
        Flow(p2.at(-40), p3.at(140), "Predicted sign\n+ confidence", via=(650, 215), lab=(676, 270), anchor="start"),
        Flow(p3.at(25), p4.at(-95), "Translated text,\nreader's language", via=(960, 200), lab=(1005, 150)),
        Flow(p4.at(110), student.at("bottom", 0.5), "Text/speech in the reader's preferred language",
             c1=(900, 665), c2=(80, 665), lab=(500, 628)),
    ]
    return page(655, items, top=30)


# ── Figure 11: Classroom module (5.0-6.0) ─────────────────────────────────
def fig11():
    student = Rect(10, 300, 140, 76, "Student")
    teacher = Rect(950, 150, 140, 76, "Teacher")
    p5 = Circle(350, 338, 105, "5.0", "Post/Store\nAssignment &\nSubmission")
    p6 = Circle(770, 338, 92, "6.0", "Score\nSubmission")
    d2 = Store(330, 120, 330, "D2", "Assignments/Submissions")
    d1 = Store(340, 545, 250, "D1", "Trained Model")
    d3 = Store(810, 560, 280, "D3", "Scores/Gradebook")
    items = [
        student, teacher, p5, p6, d2, d1, d3,
        Flow(student.at("right", 0.5), p5.at(180), "Recorded\nsubmission", lab=(200, 402)),
        Flow(teacher.at("top", 0.5), p5.at(205), "Assignment (target sign)", c1=(1020, 10), c2=(-40, 10), lab=(600, 36)),
        Flow(p5.at(-60), d2.at("bottom", 0.25), "Assignment +\nsubmission", via=(415, 205), lab=(392, 205), anchor="end"),
        Flow(d2.at("bottom", 0.82), p6.at(215), "Submission video", via=(625, 255), lab=(602, 262), anchor="end"),
        Flow(teacher.at("left", 0.4), p6.at(-75), "Grading actions\n(score override)", via=(860, 170), lab=(840, 128)),
        Flow(p6.at(-20), teacher.at("bottom", 0.35), "Submissions, scores,\ngradebook view", via=(960, 300), lab=(1095, 322), anchor="end"),
        Flow(d1.at("top", 0.85), p6.at(135), "Model weights", via=(620, 440), lab=(585, 462), anchor="end"),
        Flow(p6.at(70), d3.at("top", 0.2), "Score", via=(820, 500), lab=(814, 505), anchor="end"),
        Flow(d3.at("top", 0.65), p6.at(25), "Gradebook\nrecords", via=(960, 420), lab=(985, 470), anchor="start"),
        Flow(p6.at(110), student.at("bottom", 0.5), "Score + feedback", c1=(700, 760), c2=(60, 720), lab=(300, 668)),
    ]
    return page(705, items)


# ── Figure 13: Account and class management (9.0-10.0) ─────────────────────
def fig13():
    admin = Rect(10, 255, 140, 76, "Admin")
    p9 = Circle(440, 145, 95, "9.0", "Manage\nAccounts")
    p10 = Circle(440, 445, 95, "10.0", "Manage\nClasses")
    d5 = Store(740, 121, 250, "D5", "Profiles")
    d6 = Store(740, 421, 250, "D6", "Classes")
    items = [
        admin, p9, p10, d5, d6,
        Flow(admin.at("top", 0.5), p9.at(195), "Account\nmanagement actions", via=(110, 100), lab=(165, 72)),
        Flow(p9.at(150), admin.at("right", 0.25), "User records", via=(250, 245), lab=(262, 196)),
        Flow(p10.at(210), admin.at("right", 0.75), "Class records", via=(250, 345), lab=(262, 396)),
        Flow(admin.at("bottom", 0.5), p10.at(165), "Class\nmanagement actions", via=(110, 490), lab=(165, 520)),
        Flow(p9.at(-15), d5.at("left", 0.5), "New or updated\nprofile", via=(620, 95), lab=(625, 70)),
        Flow(d5.at("bottom", 0.2), p9.at(20), "Profile records", via=(640, 215), lab=(640, 232)),
        Flow(p10.at(-40), d5.at("bottom", 0.8), "Class membership\n(students, teacher)", via=(880, 280), lab=(905, 300), anchor="start"),
        Flow(p10.at(-10), d6.at("left", 0.5), "New or updated class", via=(630, 395), lab=(640, 392)),
        Flow(d6.at("bottom", 0.3), p10.at(30), "Class records", via=(660, 540), lab=(660, 560)),
    ]
    return page(590, items)


# ── Figure 12: Video chat (7.0-8.0) ───────────────────────────────────────
def fig12():
    student = Rect(10, 290, 140, 76, "Student")
    teacher = Rect(950, 290, 140, 76, "Teacher")
    p8 = Circle(550, 260, 115, "8.0", "Stream Video\nand Translate\nOverlay")
    p7 = Circle(550, 520, 78, "7.0", "Establish\nCall")
    d1 = Store(420, 20, 260, "D1", "Trained Model", h=44)
    d4 = Store(330, 660, 440, "D4", "Temporary Realtime Signaling Channel")
    items = [
        student, teacher, p8, p7, d1, d4,
        Flow(d1.at("bottom", 0.5), p8.at(-90), "Model weights", lab=(562, 105), anchor="start"),
        Flow(student.at("top", 0.7), p8.at(200), "Live video/audio\n(WebRTC)", via=(200, 165), lab=(225, 155)),
        Flow(p8.at(162), student.at("right", 0.3), "Peer video +\ntranslated overlay", via=(300, 335), lab=(300, 372)),
        Flow(teacher.at("top", 0.3), p8.at(-20), "Live video/audio\n(WebRTC)", via=(900, 165), lab=(875, 155)),
        Flow(p8.at(18), teacher.at("left", 0.3), "Peer video +\ntranslated overlay", via=(800, 335), lab=(800, 372)),
        Flow(student.at("bottom", 0.5), p7.at(190), "Call request /\naccept or decline", via=(150, 525), lab=(250, 540)),
        Flow(teacher.at("bottom", 0.5), p7.at(-10), "Call request /\naccept or decline", via=(950, 525), lab=(850, 540)),
        Flow(p7.at(-90), p8.at(90), "Connection\ndetails", lab=(562, 410), anchor="start"),
        Flow(p7.at(120), d4.at("top", 0.25), "Offer, answer,\nICE candidates", via=(460, 610), lab=(445, 612), anchor="end"),
        Flow(d4.at("top", 0.75), p7.at(60), "Peer's offer, answer,\nICE candidates", via=(640, 610), lab=(655, 612), anchor="start"),
    ]
    return page(725, items)


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "."
    for name, fn in [("fig9", fig9), ("fig10", fig10), ("fig11", fig11), ("fig12", fig12), ("fig13", fig13)]:
        open(f"{out}/{name}.svg", "w", encoding="utf8").write(fn())
    print("ok")
