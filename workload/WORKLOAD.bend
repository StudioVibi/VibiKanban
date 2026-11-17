# Workload (opt-in: import "bend-ui/workload"). The wheel of areas with the people in it, and the load bar.
# Pure: workload.js only reads sizes and data, asks these functions, and draws what comes back.
# Nothing here is locked yet: every value is "# undecided" until the owner fixes it (then it gets a law).
import Base


# ---------- Sizes (each workload_* number becomes a CSS variable: workload_bar_height → --workload-bar-height) ----------
def workload_bar_height() -> U32: 10  # undecided
def workload_bar_area_gap() -> U32: 3  # undecided
def workload_list_width() -> U32: 360  # undecided
def workload_ant_size() -> U32: 42  # undecided
def workload_badge_ring() -> U32: 2  # undecided
def workload_bob() -> U32: 2  # undecided
def workload_hop() -> U32: 6  # undecided
def workload_pole_icon() -> U32: 26  # undecided
def workload_key_width() -> U32: 22  # undecided

# ---------- Area colors ----------
# A board names its areas; each area takes one of these, by number. 1 is the owner's purple.
def area_color_1() -> String: "#7b4fd6"
def area_color_2() -> String: "#2a78d6"  # undecided
def area_color_3() -> String: "#d98a00"  # undecided
def area_color_4() -> String: "#d6457a"  # undecided
def area_color_5() -> String: "#1a9e6e"  # undecided

# Never a false neutral: areas whose hues are this close (degrees) blend; farther ones don't (they'd mix to grey).
def near_hue() -> F32: 100.0  # undecided
# A skill that also belongs to a far area keeps its main area's color, this much toward the ink below.
def far_shade() -> F32: 0.22  # undecided
def far_ink() -> String: "#1d1630"  # undecided

# ---------- The bar's textures (cartography: one stroke weight, opposite angles side by side) ----------
def review_angle() -> F32: 45.0  # undecided
def review_period() -> F32: 4.0  # undecided
def review_line() -> F32: 1.0  # undecided
def review_base() -> F32: 0.30  # undecided
def backlog_angle() -> F32: 135.0  # undecided
def backlog_period() -> F32: 6.0  # undecided
def backlog_line() -> F32: 1.0  # undecided
def backlog_base() -> F32: 0.14  # undecided
def done_base() -> F32: 0.38  # undecided

# ---------- Color: sRGB ↔ OKLab, so a blend sits halfway between two colors as the eye sees them ----------
def lin(+c: F32) -> F32:
  Bool.pick(F32, F32.is_le(c, 0.04045), (c / 12.92 : F32), F32.pow(((c + 0.055) / 1.055 : F32), 2.4))

def gam(+c: F32) -> F32:
  F32.clamp(Bool.pick(F32, F32.is_le(c, 0.0031308), (12.92 * c : F32), (1.055 * F32.pow(F32.max(c, 0.0), (1.0 / 2.4 : F32)) - 0.055 : F32)), 0.0, 1.0)

def cbrt(+x: F32) -> F32:
  Bool.pick(F32, F32.is_lt(x, 0.0), (0.0 - F32.pow((0.0 - x : F32), (1.0 / 3.0 : F32)) : F32), F32.pow(x, (1.0 / 3.0 : F32)))

def lms_l(+r: F32, +g: F32, +b: F32) -> F32:
  cbrt((0.4122214708 * lin(r) + 0.5363325363 * lin(g) + 0.0514459929 * lin(b) : F32))

def lms_m(+r: F32, +g: F32, +b: F32) -> F32:
  cbrt((0.2119034982 * lin(r) + 0.6806995451 * lin(g) + 0.1073969566 * lin(b) : F32))

def lms_s(+r: F32, +g: F32, +b: F32) -> F32:
  cbrt((0.0883024619 * lin(r) + 0.2817188376 * lin(g) + 0.6299787005 * lin(b) : F32))

# r, g, b from 0 to 1 → OKLab L, a, b.
def lab_l(+r: F32, +g: F32, +b: F32) -> F32:
  (0.2104542553 * lms_l(r, g, b) + 0.793617785 * lms_m(r, g, b) - 0.0040720468 * lms_s(r, g, b) : F32)

def lab_a(+r: F32, +g: F32, +b: F32) -> F32:
  (1.9779984951 * lms_l(r, g, b) - 2.428592205 * lms_m(r, g, b) + 0.4505937099 * lms_s(r, g, b) : F32)

def lab_b(+r: F32, +g: F32, +b: F32) -> F32:
  (0.0259040371 * lms_l(r, g, b) + 0.7827717662 * lms_m(r, g, b) - 0.808675766 * lms_s(r, g, b) : F32)

def cube(+x: F32) -> F32:
  (x * x * x : F32)

def back_l(+l: F32, +a: F32, +b: F32) -> F32:
  cube((l + 0.3963377774 * a + 0.2158037573 * b : F32))

def back_m(+l: F32, +a: F32, +b: F32) -> F32:
  cube((l - 0.1055613458 * a - 0.0638541728 * b : F32))

def back_s(+l: F32, +a: F32, +b: F32) -> F32:
  cube((l - 0.0894841775 * a - 1.291485548 * b : F32))

# OKLab → r, g, b from 0 to 1.
def rgb_r(+l: F32, +a: F32, +b: F32) -> F32:
  gam((4.0767416621 * back_l(l, a, b) - 3.3077115913 * back_m(l, a, b) + 0.2309699292 * back_s(l, a, b) : F32))

def rgb_g(+l: F32, +a: F32, +b: F32) -> F32:
  gam((0.0 - 1.2684380046 * back_l(l, a, b) + 2.6097574011 * back_m(l, a, b) - 0.3413193965 * back_s(l, a, b) : F32))

def rgb_b(+l: F32, +a: F32, +b: F32) -> F32:
  gam((0.0 - 0.0041960863 * back_l(l, a, b) - 0.7034186147 * back_m(l, a, b) + 1.707614701 * back_s(l, a, b) : F32))

# A blend: the weighted middle of the values (one OKLab channel at a time).
def dot(xs: List<&2, F32>, ws: List<&2, F32>) -> F32:
  match xs:
    case Nil{}:
      0.0
    case h <> t:
      match ws:
        case Nil{}:
          0.0
        case w <> u:
          (h * w + dot(t, u) : F32)

def sum(xs: List<&2, F32>) -> F32:
  match xs:
    case Nil{}:
      0.0
    case h <> t:
      (h + sum(t) : F32)

def blend(xs: List<&2, F32>, +ws: List<&2, F32>) -> F32:
  (dot(xs, ws) / sum(ws) : F32)

# Where a color sits on the hue circle, in degrees, and how far apart two hues are (0 to 180).
def hue(+a: F32, +b: F32) -> F32:
  (F32.atan2(b, a) * 180.0 / F32.pi() : F32)

def hue_gap.fold(+d: F32) -> F32:
  Bool.pick(F32, F32.is_gt(d, 180.0), (360.0 - d : F32), d)

def hue_gap(+h1: F32, +h2: F32) -> F32:
  hue_gap.fold(F32.abs((h1 - h2 : F32)))

def is_near(+gap: F32) -> Bool:
  F32.is_le(gap, near_hue())

# ---------- The wheel: areas around a circle, skills between them ----------
# Positions are fractions of the wheel's box: (0, 0) top left, (1, 1) bottom right.
def wheel_radius_x() -> F32: 0.44  # undecided
def wheel_radius_y() -> F32: 0.42  # undecided
def wheel_pull() -> F32: 0.6  # undecided
def skill_spread() -> F32: 0.11  # undecided

# Area i of n, as a turn from the top, clockwise; the first one sits up and to the left.
def pole_turn(+i: F32, +n: F32) -> F32:
  ((i - 0.5) / n : F32)

def pole_x(+i: F32, +n: F32) -> F32:
  (0.5 + wheel_radius_x() * F32.sin((2.0 * F32.pi() * pole_turn(i, n) : F32)) : F32)

def pole_y(+i: F32, +n: F32) -> F32:
  (0.5 - wheel_radius_y() * F32.cos((2.0 * F32.pi() * pole_turn(i, n) : F32)) : F32)

# A skill sits at the weighted middle of its areas' poles, pulled toward the center.
def pulled(+v: F32) -> F32:
  (0.5 + (v - 0.5) * wheel_pull() : F32)

# Skills that share a main area spread along the wheel, so no two land on the same spot:
# skill k of m in that area moves along the circle's direction at its main pole.
def spread(+k: F32, +m: F32) -> F32:
  ((k - (m - 1.0) / 2.0) * skill_spread() : F32)

def spread_x(+t: F32, +k: F32, +m: F32) -> F32:
  (F32.cos((2.0 * F32.pi() * t : F32)) * spread(k, m) : F32)

def spread_y(+t: F32, +k: F32, +m: F32) -> F32:
  (F32.sin((2.0 * F32.pi() * t : F32)) * spread(k, m) : F32)

# ---------- People on the wheel: one ant per skill a person has open tasks in ----------
def ant_step() -> F32: 6.0  # undecided
def presence_gap() -> F32: 50.0  # undecided
def presence_drop() -> F32: 42.0  # undecided
def low_edge() -> F32: 0.78  # undecided

# The ant grows with the tasks that person has in that skill.
def ant_size(+n: F32) -> F32:
  (U32.to_f32(workload_ant_size()) + n * ant_step() : F32)

# Person i of n at the same skill: side by side under its pill (above it, near the bottom edge). In pixels.
def presence_dx(+i: F32, +n: F32) -> F32:
  ((i - (n - 1.0) / 2.0) * presence_gap() : F32)

def presence_dy(+y: F32) -> F32:
  Bool.pick(F32, F32.is_gt(y, low_edge()), (0.0 - presence_drop() : F32), presence_drop())

# ---------- The load bar ----------
# One capsule per area, a cut between them, then the track (also a capsule). w wide, h tall.
# total is how many tasks the full width holds (the busiest person); n is this person's, in g areas.
def bar_fill(+w: F32, +n: F32, +total: F32, +g: F32, +gap: F32) -> F32:
  ((w - Bool.pick(F32, F32.is_lt(n, total), gap, 0.0)) * n / total - gap * (g - 1.0) : F32)

def bar_unit(+w: F32, +n: F32, +total: F32, +g: F32, +gap: F32) -> F32:
  Bool.pick(F32, F32.is_gt(n, 0.0), (bar_fill(w, n, total, g, gap) / F32.max(n, 1.0) : F32), 0.0)

# An area's capsule never gets narrower than it is tall, so it always has two round ends.
def area_width(+k: F32, +unit: F32, +h: F32) -> F32:
  F32.max((k * unit : F32), h)

# Hatching is anchored at the bar's start (x = 0), so its lines run through every piece without a seam.
# The first and last line that can touch a piece from x to x + w, h tall, one line every period.
def hatch_first(+x: F32, +h: F32, +period: F32) -> F32:
  (F32.floor(((x - h) / period : F32)) - 1.0 : F32)

def hatch_last(+x: F32, +w: F32, +period: F32) -> F32:
  (F32.ceil(((x + w) / period : F32)) + 1.0 : F32)

# ---------- Sprints ----------
# Sprints run back to back from an anchor day. Day d (days since the anchor) is in sprint index(d), which starts on day start(d).
def sprint_days() -> F32: 14.0  # undecided

def sprint_index(+d: F32, +len: F32) -> F32:
  F32.floor((d / len : F32))

def sprint_start(+d: F32, +len: F32) -> F32:
  (sprint_index(d, len) * len : F32)
