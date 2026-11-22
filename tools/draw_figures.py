"""Draws simple two-frame (start/end) demo illustrations for exercises that have no
public-domain photo. Output: media/<id>/0.svg and 1.svg. Our own work (MIT).

Usage: python tools/draw_figures.py
"""
import os
from html import escape as esc

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NEAR, FAR, TORSO, SKIN, HAIR = '#2f6fe0', '#9db7ec', '#1d3f8f', '#f1c6a0', '#3b2a20'
FLOOR = 262


def pl(pts, color, w):
    return f'<polyline points="{" ".join(f"{x},{y}" for x, y in pts)}" fill="none" stroke="{color}" stroke-width="{w}" stroke-linecap="round" stroke-linejoin="round"/>'


def svg(body, label, note=''):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="800" height="600">
<rect width="400" height="300" fill="#ffffff"/>
<g transform="translate(40,58) scale(0.8)">
<line x1="-40" y1="{FLOOR + 4}" x2="440" y2="{FLOOR + 4}" stroke="#cfd5de" stroke-width="3"/>
{body}
</g>
<text x="16" y="28" font-family="Segoe UI,Roboto,Arial,sans-serif" font-size="17" font-weight="700" fill="#1d3f8f">{esc(label)}</text>
<text x="16" y="48" font-family="Segoe UI,Roboto,Arial,sans-serif" font-size="13" fill="#5b6575">{esc(note)}</text>
</svg>'''


def figure(head, neck, hip, far=(), near=(), hair_dir=-1):
    """far/near: lists of polylines (limbs). Torso drawn between neck and hip."""
    out = [pl(l, FAR, 15) for l in far]
    out.append(pl([neck, hip], TORSO, 26))
    out += [pl(l, NEAR, 16) for l in near]
    hx, hy = head
    out.append(f'<circle cx="{hx}" cy="{hy}" r="17" fill="{SKIN}"/>')
    out.append(f'<path d="M{hx - 17},{hy - 2} A17,17 0 0 1 {hx + 17},{hy - 2} L{hx + 17 * hair_dir * -0.2},{hy - 6} Z" fill="{HAIR}"/>')
    return '\n'.join(out)


def mat(x1, x2):
    return f'<rect x="{x1}" y="{FLOOR}" width="{x2 - x1}" height="7" rx="3" fill="#9fd8bd"/>'


def arrow(x1, y1, x2, y2, c='#e0822b'):
    return (f'<defs><marker id="a" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="{c}"/></marker></defs>'
            f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{c}" stroke-width="3" stroke-dasharray="6 4" marker-end="url(#a)"/>')


F = {}

# ---- Bird-dog (side view, facing right) ----
sh, hp = (255, 170), (150, 172)
F['bird-dog'] = [
    svg(mat(60, 340) + figure((290, 152), sh, hp,
        far=[[sh, (255, 215), (258, FLOOR)], [hp, (150, 218), (152, FLOOR), (100, FLOOR)]],
        near=[[sh, (252, 215), (252, FLOOR)], [hp, (148, 218), (148, FLOOR), (98, FLOOR)]]),
        'Start', 'Hands under shoulders, knees under hips, back flat'),
    svg(mat(60, 340) + figure((290, 152), sh, hp,
        far=[[sh, (255, 215), (258, FLOOR)], [hp, (100, 174), (52, 172)]],
        near=[[sh, (300, 166), (348, 162)], [hp, (148, 218), (148, FLOOR), (98, FLOOR)]]),
        'Reach & hold 2–3 s', 'Opposite arm + leg level with the body. Hips stay square'),
]

# ---- McGill curl-up (side view, lying, head left) ----
def curl(lift):
    head = (78, 236 - lift); shl = (112, 244 - lift * 0.6); hip = (212, 246)
    return figure(head, shl, hip,
                  far=[[hip, (285, 250), (335, 252)]],
                  near=[[shl, (160, 252), (196, 250)], [hip, (255, 200), (292, 252), (310, FLOOR - 2)]], hair_dir=1)
F['mcgill-curl-up'] = [
    svg(mat(50, 350) + curl(0), 'Start', 'One knee bent, hands under the lower back'),
    svg(mat(50, 350) + curl(16) + arrow(60, 230, 60, 205), 'Lift & hold 8–10 s',
        'Head + shoulders up a few cm. Keep the low-back arch'),
]

# ---- Standing figure, front view helper ----
def front(lleg, rleg, larm, rarm, extra='', head=(200, 62)):
    neck, hip = (200, 84), (200, 160)
    return extra + figure(head, neck, hip, far=[], near=[larm, rarm, lleg, rleg])

tower = '<rect x="30" y="40" width="30" height="226" rx="4" fill="#8b95a5"/><circle cx="60" cy="248" r="7" fill="#555"/>'
la_tower = [(184, 92), (130, 118), (64, 120)]
ra_side = [(216, 92), (230, 130), (234, 168)]
stand_l = [(192, 160), (190, 212), (188, FLOOR), (172, FLOOR)]

def abd(out):
    rl = [(208, 160), (228, 210), (250, 252)] if out else [(208, 160), (210, 212), (212, FLOOR)]
    ankle = rl[-1]
    cable = f'<line x1="60" y1="248" x2="{ankle[0]}" y2="{ankle[1]}" stroke="#444" stroke-width="2.5"/>'
    return front(stand_l, rl + [(ankle[0] + 16, ankle[1] + 2)], la_tower, ra_side, extra=tower + cable)
F['cable-hip-abduction'] = [
    svg(abd(False), 'Start', 'Strap on the outside ankle, hold the machine, stand tall'),
    svg(abd(True) + arrow(232, 236, 262, 222), 'Lift out ~30–40°', 'Slow. Torso upright, toes pointing forward'),
]

# ---- Seated banded abduction (front view) ----
def seated(open_):
    kx = 50 if open_ else 18
    bench = '<rect x="130" y="170" width="140" height="18" rx="4" fill="#8b95a5"/><rect x="140" y="188" width="10" height="76" fill="#8b95a5"/><rect x="250" y="188" width="10" height="76" fill="#8b95a5"/>'
    lk, rk = (200 - kx, 196), (200 + kx, 196)
    band = f'<line x1="{lk[0]}" y1="{lk[1] - 8}" x2="{rk[0]}" y2="{rk[1] - 8}" stroke="#e53e3e" stroke-width="7" stroke-linecap="round"/>'
    body = figure((200, 62), (200, 84), (200, 168), near=[
        [(184, 92), (160, 130), (150, 168)], [(216, 92), (240, 130), (250, 168)],
        [(190, 168), lk, (190 - kx * 0.6, FLOOR), (175 - kx * 0.6, FLOOR)],
        [(210, 168), rk, (210 + kx * 0.6, FLOOR), (225 + kx * 0.6, FLOOR)]])
    return bench + body + band
F['seated-band-abduction'] = [
    svg(seated(False), 'Start', 'Band just above the knees, sit tall, hands on the bench'),
    svg(seated(True), 'Push knees apart', 'Hold 1 s, return slowly. Back stays tall'),
]

# ---- Single-leg stand (front view, rail on the right) ----
rail = '<rect x="318" y="120" width="10" height="146" fill="#8b95a5"/><rect x="240" y="120" width="88" height="8" rx="4" fill="#8b95a5"/>'
ra_rail = [(216, 92), (250, 112), (272, 122)]
la_down = [(184, 92), (170, 130), (166, 168)]
F['single-leg-stand'] = [
    svg(front(stand_l, [(208, 160), (210, 212), (212, FLOOR), (228, FLOOR)], la_down, ra_rail, extra=rail),
        'Start', 'Stand tall next to a rail, one hand on it'),
    svg(front([(192, 160), (176, 196), (186, 226), (172, 230)], [(208, 160), (210, 212), (212, FLOOR), (228, FLOOR)], la_down, ra_rail, extra=rail),
        'Lift one foot & hold', 'Look ahead, soft standing knee. Switch legs'),
]

# ---- Heel-to-toe walk (side view, facing right) ----
def tandem(shift):
    x = shift
    hip, neck, head = (190 + x, 160), (194 + x, 86), (198 + x, 62)
    line = '<line x1="20" y1="268" x2="380" y2="268" stroke="#e0822b" stroke-width="3" stroke-dasharray="10 8"/>'
    back = [hip, (184 + x, 212), (172 + x, FLOOR), (196 + x, FLOOR)]
    front_ = [hip, (198 + x, 212), (200 + x, FLOOR), (224 + x, FLOOR)]
    arms = [[(194 + x, 96), (160 + x, 118), (130 + x, 124)], [(194 + x, 96), (226 + x, 118), (256 + x, 124)]]
    return line + figure(head, neck, hip, far=[back, arms[0]], near=[front_, arms[1]], hair_dir=1)
F['tandem-walk'] = [
    svg(tandem(0), 'Step', 'Heel of the front foot touches the toes of the back foot'),
    svg(tandem(28), 'Next step', 'Slow, eyes ahead, near a wall or rail'),
]


def main():
    for xid, frames in F.items():
        d = os.path.join(ROOT, 'media', xid)
        os.makedirs(d, exist_ok=True)
        for i, s in enumerate(frames):
            with open(os.path.join(d, f'{i}.svg'), 'w', encoding='utf-8') as f:
                f.write(s)
    print(len(F), 'illustrated exercises')


if __name__ == '__main__':
    main()
