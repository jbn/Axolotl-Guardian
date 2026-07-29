# Axolotl Guardian — characters: player axolotl (+ baby), enemies, boss.
# Node names + rest dimensions must match what the game code animates (see js/).

import math
import importlib
from mathutils import Vector
import lib
importlib.reload(lib)
from lib import (T, sph, ico, cone, cyl, box, torus, arc_tube, empty, join, apply_xf,
                 blob, decimate, smooth_shade, jitter, duplicate, parent,
                 srgb, mix, vpaint, vnoise, material, set_mat)

# ---------------------------------------------------------------- palette

PINK = srgb(0xffa8bf)
PINK_LT = srgb(0xffd9e3)
PINK_DK = srgb(0xff8fb0)
GILL = srgb(0xe8547f)
GILL_TIP = srgb(0xff9dbb)
AQUA = srgb(0x9fe0ff)


# ================================================================ player

def _paint_axo_body(co):
    # belly lightens, back deepens, subtle freckles on top
    c = mix(PINK, PINK_LT, (-co.z - 0.02) / 0.35)
    c = mix(c, PINK_DK, (co.z - 0.22) / 0.5)
    if co.z > 0.05 and vnoise(co, 7.0, 3.0) > 0.86:
        c = mix(c, PINK_DK, 0.55)
    return c


def _gill_frond():
    parts = [sph(0.062, (0, 0, 0.0)), sph(0.06, (0, 0, 0.09)), sph(0.058, (0, 0, 0.18)),
             sph(0.054, (0, 0, 0.27)), sph(0.048, (0, 0, 0.36)), sph(0.04, (0, 0, 0.45)),
             sph(0.032, (0, 0, 0.52))]
    for s in (-1, 1):
        parts += [sph(0.046, (s * 0.055, 0, 0.12)), sph(0.05, (s * 0.06, 0, 0.25)),
                  sph(0.042, (s * 0.055, 0, 0.38))]
    o = blob(parts, voxel=0.025, name='gillFrond', ratio=0.6)
    vpaint(o, lambda co: mix(GILL, GILL_TIP, co.z / 0.5))
    return o


def _leg():
    parts = [sph(0.12, (0, 0, 0.0)), sph(0.105, (0.01, 0, -0.13)),
             sph(0.095, (0.05, 0, -0.22), scale=(1.3, 1.0, 0.62)),
             sph(0.046, (0.17, 0.07, -0.24)), sph(0.05, (0.2, 0, -0.245)),
             sph(0.046, (0.17, -0.07, -0.24))]
    o = blob(parts, voxel=0.022, name='legTemplate', ratio=0.55)
    vpaint(o, lambda co: mix(PINK, PINK_LT, (-co.z - 0.08) / 0.25))
    return o


def axolotl():
    skin = material('axoSkin', vcol=True, emit=0xff6f95, strength=0.2)
    gill_m = material('axoGill', vcol=True, emit=0xff2f6e, strength=0.45)
    fin_m = material('axoFin', vcol=True, emit=0x7fb8d8, strength=0.18)
    eye_m = material('axoEye', color=0x241f33, rough=0.25)
    glint_m = material('axoGlint', color=0xffffff, emit=0xffffff, strength=1.0)
    smile_m = material('axoSmile', color=0xc25574)
    glow_m = material('axoTailGlow', color=0x7fd8ff, emit=0x4fc8ff, strength=1.0, alpha=0.0)

    # ---- body (root mesh) ----
    body = blob([
        sph(0.42, T(0.55, 0.06, 0)),
        sph(0.46, T(0.13, 0.07, 0), scale=(1.05, 1.0, 0.96)),
        sph(0.41, T(-0.27, 0.03, 0)),
        sph(0.33, T(-0.62, 0.0, 0)),
        sph(0.25, T(-0.88, -0.01, 0)),
        sph(0.4, T(0.1, -0.1, 0), scale=(1.15, 1.0, 0.8)),   # belly chub
    ], voxel=0.045, name='body', ratio=0.45)
    vpaint(body, _paint_axo_body)
    set_mat(body, skin)

    # dorsal fin ridge along the spine (axolotls have a soft back membrane)
    dorsal = ico(1.0, T(-0.45, 0.38, 0), scale=(0.75, 0.05, 0.22), sub=3, name='dorsalFin')
    apply_xf(dorsal)
    smooth_shade(dorsal)
    vpaint(dorsal, lambda co: mix(PINK, AQUA, (co.z - 0.3) / 0.5))
    set_mat(dorsal, fin_m)

    # ---- head group ----
    head = empty('head', T(0.85, 0.1, 0))
    head_mesh = blob([
        sph(0.5, (0, 0, 0.02), scale=(1.06, 1.0, 0.92)),
        sph(0.33, (0.28, 0, -0.08), scale=(1.12, 1.05, 0.72)),   # muzzle
        sph(0.17, (0.08, 0.34, -0.03)),                          # cheeks
        sph(0.17, (0.08, -0.34, -0.03)),
    ], voxel=0.04, name='headMesh', ratio=0.32)

    def paint_head(co):
        c = mix(PINK, PINK_LT, (-co.z + 0.12) / 0.4)
        c = mix(c, PINK_DK, (co.z - 0.28) / 0.4)
        for s in (-1, 1):
            dx, dy, dz = co.x - 0.3, co.y - s * 0.34, co.z + 0.12
            d = math.sqrt(dx * dx + dy * dy + dz * dz)
            if d < 0.17:
                c = mix(c, srgb(0xff86ac), 0.8 * (1.0 - d / 0.17))
        return c
    vpaint(head_mesh, paint_head)
    set_mat(head_mesh, skin)

    kids = [head_mesh]
    for s in (-1, 1):
        eye = sph(0.115, T(0.33, 0.15, s * 0.31), scale=(0.8, 1.0, 1.0),
                  seg=16, rings=12, name='eye%s' % ('LR'[s > 0]))
        smooth_shade(eye)
        set_mat(eye, eye_m)
        glint = sph(0.04, T(0.4, 0.2, s * 0.33), seg=10, rings=8)
        smooth_shade(glint)
        set_mat(glint, glint_m)
        kids += [eye, glint]

    smile = arc_tube(r=0.13, tube=0.02, a0=math.pi + 0.55, a1=math.tau - 0.55,
                     seg=12, tseg=6, name='smile')
    smile.rotation_euler = (0, math.radians(90), 0)
    smile.location = T(0.47, -0.02, 0)
    smooth_shade(smile)
    set_mat(smile, smile_m)
    kids.append(smile)

    frond = _gill_frond()
    set_mat(frond, gill_m)
    gi = 0
    first = frond
    for s in (-1, 1):
        for i in range(3):
            g = first if gi == 0 else duplicate(first)
            g.name = 'gill%d' % gi
            g.location = T(-0.08 - i * 0.15, 0.16 + i * 0.03, s * (0.32 + i * 0.07))
            # tilt outward to the frond's own side (blender -y == three +z), sweep back
            g.rotation_euler = (s * (0.7 + i * 0.22), -(0.5 + i * 0.14), 0)
            g.scale = [(0.95, 1.1, 0.8)[i]] * 3
            kids.append(g)
            gi += 1
    parent(kids, head)

    # ---- tail group ----
    tail = empty('tail', T(-0.75, 0, 0))
    fin = blob([
        sph(1.0, T(-0.45, 0.1, 0), scale=(0.62, 0.085, 0.4)),
        sph(1.0, T(-0.95, 0.14, 0), scale=(0.33, 0.06, 0.24)),
    ], voxel=0.03, name='tailFin', ratio=0.3)
    vpaint(fin, lambda co: mix(PINK, AQUA, (-co.x - 0.35) / 0.9))
    set_mat(fin, fin_m)
    glow = duplicate(fin, name='tailGlow', linked=False)
    glow.scale = (1.12, 1.5, 1.12)
    set_mat(glow, glow_m)
    parent([fin, glow], tail)

    # ---- legs ----
    leg = _leg()
    set_mat(leg, material('axoLeg', vcol=True, emit=0xff6f95, strength=0.15))
    legs = []
    leg_defs = [('legFL', 0.45, 0.36), ('legFR', 0.45, -0.36),
                ('legBL', -0.42, 0.36), ('legBR', -0.42, -0.36)]
    for idx, (nm, lx, lz) in enumerate(leg_defs):
        l = leg if idx == 0 else duplicate(leg)
        l.name = nm
        l.location = T(lx, -0.3, lz)
        sb = -1 if lz > 0 else 1
        l.rotation_euler = (sb * -0.24, -0.1 if lx > 0 else 0.1, sb * -0.3)
        legs.append(l)

    return [body, dorsal, head, tail] + legs


# ================================================================ baby axolotl

def axolotl_baby():
    skin = material('babySkin', vcol=True, emit=0xff7fa5, strength=0.3)
    gill_m = material('babyGill', vcol=True, emit=0xff3f6e, strength=0.5)
    eye_m = material('babyEye', color=0x2a2438, rough=0.25)
    glint_m = material('babyGlint', color=0xffffff, emit=0xffffff, strength=1.0)

    body = blob([
        sph(0.3, T(0.32, 0.06, 0), scale=(1.05, 1.0, 0.95)),    # big head
        sph(0.2, T(0.5, -0.04, 0), scale=(1.1, 1.0, 0.7)),      # muzzle
        sph(0.11, T(0.36, 0.0, 0.24)), sph(0.11, T(0.36, 0.0, -0.24)),  # cheeks
        sph(0.21, T(-0.02, 0.0, 0)),
        sph(0.15, T(-0.3, -0.02, 0)),
        sph(0.55, T(-0.62, 0.06, 0), scale=(0.55, 0.1, 0.32)),  # tail fin
    ], voxel=0.028, name='babyBody', ratio=0.3)

    def paint(co):
        c = mix(srgb(0xffb3c8), srgb(0xffdde8), (-co.z + 0.05) / 0.3)
        c = mix(c, AQUA, (-co.x - 0.75) / 0.5)
        for s in (-1, 1):
            dx, dy, dz = co.x - 0.48, co.y - s * 0.2, co.z + 0.08
            if math.sqrt(dx * dx + dy * dy + dz * dz) < 0.11:
                c = mix(c, srgb(0xff86ac), 0.7)
        return c
    vpaint(body, paint)
    set_mat(body, skin)
    roots = [body]

    frond = None
    for gi in range(6):
        s = -1 if gi < 3 else 1
        i = gi % 3
        if frond is None:
            frond = _gill_frond()
            set_mat(frond, gill_m)
            g = frond
        else:
            g = duplicate(frond)
        g.name = 'babyGill%d' % gi
        g.scale = (0.55, 0.55, 0.55)
        g.location = T(0.3 - i * 0.09, 0.22 + i * 0.02, s * (0.22 + i * 0.05))
        g.rotation_euler = (s * (0.75 + i * 0.22), -(0.5 + i * 0.12), 0)
        roots.append(g)

    for s in (-1, 1):
        eye = sph(0.075, T(0.47, 0.12, s * 0.2), seg=12, rings=10)
        smooth_shade(eye)
        set_mat(eye, eye_m)
        glint = sph(0.026, T(0.51, 0.15, s * 0.21), seg=8, rings=6)
        smooth_shade(glint)
        set_mat(glint, glint_m)
        roots += [eye, glint]

    stub_m = material('babyStub', color=0xffc3d4, emit=0xff7fa5, strength=0.25)
    for idx, (lx, lz) in enumerate([(0.22, 0.2), (0.22, -0.2), (-0.14, 0.2), (-0.14, -0.2)]):
        l = sph(0.055, T(lx, -0.22, lz), scale=(1.1, 1.0, 1.5))
        smooth_shade(l)
        l.name = 'babyLeg%d' % idx
        set_mat(l, stub_m)
        roots.append(l)
    return roots


# ================================================================ enemies

CORRUPT = srgb(0xb03fe8)


def _corrupt_mat():
    return material('corrupt', color=0x8a2fb8, emit=0xb03fe8, strength=0.7, rough=0.25)


def _crystal_spike(r, h, at, tilt=(0, 0, 0), seed=1, verts=5):
    c = cone(r1=r, r2=r * 0.12, depth=h, at=at, verts=verts)
    c.rotation_euler = tilt
    apply_xf(c, loc=False)
    jitter(c, r * 0.16, seed)
    smooth_shade(c, False)
    return c


def crab():
    body_m = material('crabBody', vcol=True, emit=0x992f11, strength=0.15)
    claw_m = material('crabClaw', vcol=True, emit=0x992f11, strength=0.12)
    eye_m = material('crabEye', color=0xffffff, emit=0xd05fff, strength=0.8)

    body = blob([
        sph(0.72, T(0, 0.08, 0), scale=(1.28, 0.72, 1.05)),
        sph(0.4, T(0.45, 0.28, 0), scale=(1.0, 0.7, 1.3)),      # brow ridge
        sph(0.55, T(-0.1, -0.12, 0), scale=(1.2, 0.6, 1.0)),    # underside
    ], voxel=0.04, name='crabBody', ratio=0.4)

    def paint_crab(co):
        c = mix(srgb(0xe8734a), srgb(0xc8552f), (co.z - 0.1) / 0.5)
        c = mix(c, srgb(0xf8a878), (-co.z - 0.15) / 0.3)
        if co.z > 0.1 and vnoise(co, 5.0, 7.0) > 0.78:
            c = mix(c, srgb(0xb84a26), 0.6)
        return c
    vpaint(body, paint_crab)
    set_mat(body, body_m)
    roots = [body]

    # spindly legs, 3 per side
    leg_m = material('crabLeg', color=0xc8552f)
    for s in (-1, 1):
        for k, lx in enumerate((-0.45, -0.05, 0.35)):
            l = cone(r1=0.075, r2=0.015, depth=0.55, at=T(lx, -0.36, s * 0.68), verts=6)
            l.rotation_euler = (s * 2.35, 0, 0)
            smooth_shade(l)
            set_mat(l, leg_m)
            roots.append(l)

    # chunky pincers (game code raises these during windup)
    palm = [sph(0.21, (0, 0, 0), scale=(1.2, 0.95, 0.85)),
            sph(0.13, (0.2, 0.05, 0.04), scale=(1.5, 0.75, 0.75)),
            sph(0.1, (0.18, -0.08, 0.05), scale=(1.5, 0.6, 0.6))]
    clawL = blob(palm, voxel=0.02, name='clawL', ratio=0.5)
    vpaint(clawL, lambda co: mix(srgb(0xd85f3a), srgb(0xa83f22), (co.x - 0.05) / 0.35))
    set_mat(clawL, claw_m)
    clawR = duplicate(clawL, 'clawR')
    for o, s in ((clawL, 1), (clawR, -1)):
        o.location = T(0.78, -0.05, s * 0.62)
        o.rotation_euler = (0, 0, s * 0.35)
        o.scale = (1.15, 1.15, 1.15)
    roots += [clawL, clawR]

    # eye stalks
    stalk_m = material('crabStalk', color=0xd85f3a)
    pupil_m = material('crabPupil', color=0x2a1030, rough=0.3)
    for s in (-1, 1):
        st = cyl(0.062, 0.5, T(0.52, 0.48, s * 0.24), verts=7)
        st.rotation_euler = (s * -0.22, -0.18, 0)
        smooth_shade(st)
        set_mat(st, stalk_m)
        eye = sph(0.14, T(0.57, 0.72, s * 0.29), seg=14, rings=10)
        smooth_shade(eye)
        set_mat(eye, eye_m)
        pupil = sph(0.06, T(0.68, 0.76, s * 0.31), scale=(1, 1.2, 1))
        smooth_shade(pupil)
        set_mat(pupil, pupil_m)
        roots += [st, eye, pupil]

    # removable crystal armor (named group; game removes it when cracked)
    shell = empty('shell', (0, 0, 0))
    cm = _corrupt_mat()
    spots = [(-0.35, 0.52, 0.2, 0.24, 0.9), (0.02, 0.6, -0.22, 0.3, 1.15),
             (0.32, 0.5, 0.18, 0.22, 0.8), (-0.06, 0.55, 0.42, 0.19, 0.7),
             (0.14, 0.52, -0.42, 0.2, 0.75), (-0.28, 0.5, -0.1, 0.17, 0.6)]
    spikes = []
    for i, (x, y, z, r, h) in enumerate(spots):
        c = _crystal_spike(r, h, T(x, y + h * 0.3, z),
                           tilt=(math.sin(i * 2.1) * 0.35, math.cos(i * 1.3) * 0.3, 0), seed=i)
        set_mat(c, cm)
        spikes.append(c)
    parent(spikes, shell)
    roots.append(shell)
    return roots


def vine():
    stalk_m = material('vineStalk', vcol=True, emit=0x1f4f1f, strength=0.2)
    bud_m = material('vineBud', vcol=True, emit=0xff3fae, strength=0.55)

    def paint_seg(co):
        r = math.sqrt(co.x * co.x + co.y * co.y)
        if r > 0.21:
            return srgb(0x8a5a3a)  # thorns
        return mix(srgb(0x2f6326), srgb(0x55913d), (co.z + 0.36) / 0.72)

    roots = []
    seg0 = None
    for i in range(5):
        w = 1.0 - i * 0.09
        if seg0 is None:
            stalk = cone(r1=0.19, r2=0.15, depth=0.95, at=(0, 0, 0), verts=10)
            smooth_shade(stalk)
            knob = sph(0.19, (0, 0, 0.42), scale=(1, 1, 0.75), seg=14, rings=10)
            smooth_shade(knob)
            knob2 = sph(0.2, (0, 0, -0.42), scale=(1, 1, 0.75), seg=14, rings=10)
            smooth_shade(knob2)
            thorns = []
            for j in range(4):
                a = j * 1.7 + 0.6
                d = Vector((math.cos(a), math.sin(a), 0.25))
                th = cone(r1=0.05, r2=0.006, depth=0.34, verts=5,
                          at=(math.cos(a) * 0.28, math.sin(a) * 0.28, -0.3 + j * 0.2))
                th.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
                smooth_shade(th, False)
                thorns.append(th)
            s = join([stalk, knob, knob2] + thorns, 'seg0')
            apply_xf(s)
            vpaint(s, paint_seg)
            set_mat(s, stalk_m)
            seg0 = s
        else:
            s = duplicate(seg0, 'seg%d' % i)
        s.location = T(math.sin(i * 1.8) * 0.05, 0.42 + i * 0.62, math.cos(i * 2.3) * 0.04)
        s.scale = (w, w, 1)
        s.rotation_euler = (0, 0, i * 0.9)
        roots.append(s)

    # snapping flower bud on top
    bud_parts = [sph(0.4, (0, 0, 0.1), scale=(1.0, 1.0, 1.3)),
                 sph(0.18, (0, 0, 0.52), scale=(1, 1, 1.2))]
    bud = blob(bud_parts, voxel=0.025, name='bud', ratio=0.45)

    def paint_bud(co):
        c = mix(srgb(0x8a2860), srgb(0xff3fae), (co.z + 0.1) / 0.7)
        if co.z < -0.15:
            c = mix(c, srgb(0x2f6326), 0.7)   # green sepal base
        return c
    vpaint(bud, paint_bud)
    set_mat(bud, bud_m)
    sep_m = material('vineSepal', color=0x3f7a2f)
    sepals = []
    for j in range(4):
        a = j / 4 * math.tau + 0.4
        sp = cone(r1=0.09, r2=0.01, depth=0.42, verts=5,
                  at=(math.cos(a) * 0.3, math.sin(a) * 0.3, -0.05))
        sp.rotation_euler = (-math.sin(a) * 0.9, math.cos(a) * 0.9, 0)
        smooth_shade(sp, False)
        set_mat(sp, sep_m)
        sepals.append(sp)
    bud.location = T(0, 3.42, 0)
    parent(sepals, bud)
    roots.append(bud)
    return roots


def frog():
    body_m = material('frogBody', vcol=True, emit=0x3a1f66, strength=0.5)
    eye_m = material('frogEye', color=0xffdf5f, emit=0xffbf2f, strength=1.0)
    pupil_m = material('frogPupil', color=0x1a0a2a, rough=0.3)

    # 'body' group inflates during the telegraph — eyes ride along as children
    bodyG = empty('body', (0, 0, 0))
    mesh = blob([
        sph(0.62, T(0, 0.0, 0), scale=(1.0, 0.82, 1.1)),
        sph(0.42, T(0, -0.08, 0.32), scale=(1.15, 0.62, 1.0)),   # chin/chest
        sph(0.26, T(0.3, 0.3, 0.24)), sph(0.26, T(-0.3, 0.3, 0.24)),  # brow mounds
        sph(0.3, T(0.48, -0.15, -0.28)), sph(0.3, T(-0.48, -0.15, -0.28)),  # haunches
    ], voxel=0.032, name='frogMesh', ratio=0.4)

    def paint_frog(co):
        c = mix(srgb(0x5f3a8a), srgb(0x8a63b8), (-co.z + 0.1) / 0.55)
        c = mix(c, srgb(0xb094d0), (-co.z - 0.28) / 0.3)          # belly
        if co.z > 0.05 and vnoise(co, 4.5, 11.0) > 0.74:
            c = mix(c, srgb(0x8a5fc0), 0.65)                      # back spots
        return c
    vpaint(mesh, paint_frog)
    set_mat(mesh, body_m)
    kids = [mesh]
    for s in (-1, 1):
        eye = sph(0.18, T(s * 0.3, 0.44, 0.38), seg=16, rings=12)
        smooth_shade(eye)
        set_mat(eye, eye_m)
        pupil = sph(0.08, T(s * 0.3, 0.46, 0.53), scale=(1.15, 1.3, 0.7))
        smooth_shade(pupil)
        set_mat(pupil, pupil_m)
        kids += [eye, pupil]
    parent(kids, bodyG)
    roots = [bodyG]

    # legs stay planted while the body puffs
    leg_m = material('frogLeg', color=0x4a2f70, emit=0x3a1f66, strength=0.3)
    for s in (-1, 1):
        thigh = sph(0.24, T(s * 0.55, -0.32, -0.28), scale=(0.85, 0.7, 1.3))
        smooth_shade(thigh)
        set_mat(thigh, leg_m)
        foot = sph(0.12, T(s * 0.6, -0.48, 0.02), scale=(1.1, 0.5, 1.9))
        smooth_shade(foot)
        set_mat(foot, leg_m)
        arm = sph(0.1, T(s * 0.3, -0.42, 0.34), scale=(0.9, 1.0, 1.4))
        smooth_shade(arm)
        set_mat(arm, leg_m)
        roots += [thigh, foot, arm]
    return roots


def bug():
    glow_m = material('bugGlow', color=0xdfff5f, emit=0xdfff5f, strength=2.2)
    body_m = material('bugBody', color=0x5a5238)
    wing_m = material('bugWing', color=0xe8f4ff, alpha=0.5, double=True, rough=0.3)
    body = blob([sph(0.08, (0.06, 0, 0.01)), sph(0.09, (-0.04, 0, 0))],
                voxel=0.012, name='bugBody', ratio=0.55)
    set_mat(body, body_m)
    tailglow = sph(0.095, (-0.17, 0, -0.01), scale=(1.25, 1, 1), seg=12, rings=8, name='bugTail')
    smooth_shade(tailglow)
    set_mat(tailglow, glow_m)
    roots = [body, tailglow]
    for s in (-1, 1):
        w = ico(1.0, (-0.01, s * 0.09, 0.06), scale=(0.055, 0.12, 0.008), sub=2, name='wing')
        w.rotation_euler = (s * -0.55, 0, s * 0.5)
        smooth_shade(w)
        set_mat(w, wing_m)
        roots.append(w)
    return roots


def turtle():
    shell_m = material('turtShell', vcol=True, emit=0x0f2f1f, strength=0.2)
    skin_m = material('turtSkin', vcol=True, emit=0x1f3f17, strength=0.12)
    eye_m = material('turtEye', color=0x1a1408, rough=0.3)
    glint_m = material('turtGlint', color=0xffffff, emit=0xffffff, strength=0.9)
    jaw_m = material('turtJaw', color=0xffdf9f)  # emissive set at load (glows on windup)

    shell = blob([
        sph(1.1, T(0, 0.18, 0), scale=(1.25, 0.6, 1.1)),
        sph(1.0, T(0, -0.02, 0), scale=(1.32, 0.34, 1.18)),      # rim
    ], voxel=0.055, name='shellTop', ratio=0.4)

    def paint_shell(co):
        if co.z < 0.05:
            return srgb(0x6f7a4f)                                 # underside
        tile = (math.floor((co.x + 9) / 0.62) + math.floor((co.y + 9) / 0.62)) % 2
        c = srgb(0x2f5e3f) if tile else srgb(0x3f7a52)
        return mix(c, srgb(0x24483a), (co.x * co.x + co.y * co.y) / 2.6)
    vpaint(shell, paint_shell)
    set_mat(shell, shell_m)
    roots = [shell]

    cm = _corrupt_mat()
    for i in range(6):
        a = i / 6 * math.tau
        c = _crystal_spike(0.22, 0.95, T(math.cos(a) * 0.62, 1.0, math.sin(a) * 0.62),
                           tilt=(-math.sin(a) * 0.65, math.cos(a) * 0.65, 0), seed=20 + i)
        set_mat(c, cm)
        roots.append(c)

    def paint_skin(co):
        c = mix(srgb(0x4a7a3f), srgb(0x86b06a), (-co.z + 0.15) / 0.5)
        if vnoise(co, 6.0, 31.0) > 0.8:
            c = mix(c, srgb(0x3a6132), 0.6)
        return c

    # head group (pulls back during windup telegraph)
    head = empty('head', T(1.35, -0.05, 0))
    hm = blob([
        sph(0.42, (0, 0, 0.02)),
        sph(0.3, (0.28, 0, -0.06), scale=(1.25, 0.9, 0.8)),      # beak snout
        sph(0.16, (0.18, 0.18, 0.2)), sph(0.16, (0.18, -0.18, 0.2)),  # brows
    ], voxel=0.032, name='headMesh', ratio=0.45)
    vpaint(hm, paint_skin)
    set_mat(hm, skin_m)
    kids = [hm]
    for s in (-1, 1):
        eye = sph(0.1, T(0.26, 0.16, s * 0.3), seg=12, rings=10)
        smooth_shade(eye)
        set_mat(eye, eye_m)
        gl = sph(0.03, T(0.31, 0.2, s * 0.32), seg=8, rings=6)
        smooth_shade(gl)
        set_mat(gl, glint_m)
        kids += [eye, gl]
    parent(kids, head)
    roots.append(head)

    # lower jaw (glows + grows during windup)
    jaw = blob([sph(0.28, (0, 0, 0), scale=(1.35, 0.9, 0.5)),
                sph(0.14, (0.3, 0, 0.05), scale=(1.3, 0.7, 0.5))],
               voxel=0.025, name='jaw', ratio=0.5)
    jaw.location = T(1.72, -0.3, 0)
    set_mat(jaw, jaw_m)
    roots.append(jaw)

    flip0 = None
    for i, (fx, fz) in enumerate([(0.7, 0.85), (0.7, -0.85), (-0.7, 0.85), (-0.7, -0.85)]):
        if flip0 is None:
            flip0 = blob([sph(0.3, (0, 0, 0), scale=(1.5, 0.8, 0.4)),
                          sph(0.18, (0.35, 0.1, 0.02), scale=(1.4, 0.9, 0.4))],
                         voxel=0.022, name='flipper0', ratio=0.5)
            vpaint(flip0, paint_skin)
            set_mat(flip0, skin_m)
            f = flip0
        else:
            f = duplicate(flip0, 'flipper%d' % i)
        f.location = T(fx, -0.32, fz)
        s = 1 if fz > 0 else -1
        f.rotation_euler = (0, 0, s * (0.9 if fx > 0 else 2.2))
        roots.append(f)

    tail = cone(r1=0.16, r2=0.02, depth=0.6, at=T(-1.45, -0.1, 0), verts=7)
    tail.rotation_euler = (0, math.radians(-95), 0)
    smooth_shade(tail)
    set_mat(tail, material('turtTail', color=0x5a8a4f))
    roots.append(tail)
    return roots


def eel_head():
    body_m = material('eelBody', vcol=True, emit=0x1f2f6f, strength=0.4)
    eye_m = material('eelEye', color=0xffe95f, emit=0xffcf2f, strength=1.0)
    fin_m = material('eelFin', vcol=True, emit=0x4fc8ff, strength=0.55, double=True)

    def paint_eel(co):
        c = mix(srgb(0x3a4a8a), srgb(0x7a8ac0), (-co.z + 0.1) / 0.6)
        if vnoise(co, 10.0, 47.0) > 0.94:
            c = mix(c, srgb(0x9fdfff), 0.4)   # sparse bioluminescent speckle
        return c

    hm = blob([
        sph(0.62, (0, 0, 0), scale=(1.3, 0.9, 0.9)),
        sph(0.4, T(0.5, -0.08, 0), scale=(1.3, 0.7, 0.75)),      # snout
        sph(0.2, T(0.2, 0.28, 0.28)), sph(0.2, T(0.2, 0.28, -0.28)),  # brows
    ], voxel=0.035, name='eelHead', ratio=0.4)
    vpaint(hm, paint_eel)
    set_mat(hm, body_m)
    roots = [hm]
    pupil_m = material('eelPupil', color=0x1a1430, rough=0.3)
    for s in (-1, 1):
        eye = sph(0.15, T(0.42, 0.2, s * 0.48), seg=14, rings=10)
        smooth_shade(eye)
        set_mat(eye, eye_m)
        pupil = sph(0.06, T(0.5, 0.23, s * 0.58), scale=(1.1, 1.2, 0.8))
        smooth_shade(pupil)
        set_mat(pupil, pupil_m)
        roots += [eye, pupil]
    crest = ico(1.0, T(-0.2, 0.48, 0), scale=(0.6, 0.05, 0.3), sub=3, name='crest')
    apply_xf(crest)
    smooth_shade(crest)
    vpaint(crest, lambda co: mix(srgb(0x4a5a9e), srgb(0x7fd8ff), (co.z - 0.35) / 0.35))
    set_mat(crest, fin_m)
    roots.append(crest)
    return roots


def eel_seg():
    body_m = material('eelSegBody', vcol=True, emit=0x2f3f7f, strength=0.35)
    fin_m = material('eelSegFin', vcol=True, emit=0x4fc8ff, strength=0.55, double=True)
    sg = blob([sph(0.5, (0, 0, 0), scale=(1.25, 0.85, 0.85))],
              voxel=0.035, name='segBody', ratio=0.5)
    vpaint(sg, lambda co: mix(srgb(0x4a5a9e), srgb(0x8a9ad0), (-co.z + 0.1) / 0.55))
    set_mat(sg, body_m)
    fin = ico(1.0, T(0, 0.5, 0), scale=(0.4, 0.04, 0.26), sub=3, name='segFin')
    apply_xf(fin)
    smooth_shade(fin)
    vpaint(fin, lambda co: mix(srgb(0x4a5a9e), srgb(0x7fd8ff), (co.z - 0.35) / 0.3))
    set_mat(fin, fin_m)
    return [sg, fin]


def goblin():
    body_m = material('gobBody', vcol=True, emit=0x3a2a12, strength=0.2)
    eye_m = material('gobEye', color=0xffffff, emit=0xffdf7f, strength=0.9)
    pupil_m = material('gobPupil', color=0x221408, rough=0.3)
    sack_m = material('gobSack', vcol=True)

    # body with big pointed ears joined crisp (no remesh over them)
    core = blob([
        sph(0.55, T(0, 0.02, 0), scale=(1.0, 1.12, 0.95)),
        sph(0.3, T(0, 0.05, 0.36), scale=(1.15, 0.8, 0.85)),     # muzzle
        sph(0.4, T(0, -0.35, 0.05), scale=(1.1, 0.75, 1.0)),     # belly
    ], voxel=0.032, name='gobCore', ratio=0.45)
    ears = []
    for s in (-1, 1):
        e = cone(r1=0.17, r2=0.015, depth=0.6, at=T(s * 0.38, 0.68, -0.02), verts=6)
        e.rotation_euler = (0.15, s * 0.75, 0)
        smooth_shade(e)
        ears.append(e)
    body = join([core] + ears, 'gobBody')
    apply_xf(body)

    def paint_gob(co):
        c = mix(srgb(0x6b4f2f), srgb(0x9a7a4f), (-co.z + 0.2) / 0.7)
        if co.z > 0.55:
            c = mix(c, srgb(0x54381c), min(1.0, (co.z - 0.55) / 0.4))  # ear tips
        if vnoise(co, 6.0, 53.0) > 0.84:
            c = mix(c, srgb(0x54381c), 0.5)   # mud flecks
        return c
    vpaint(body, paint_gob)
    set_mat(body, body_m)
    roots = [body]

    for s in (-1, 1):
        eye = sph(0.145, T(s * 0.22, 0.28, 0.4), seg=14, rings=10)
        smooth_shade(eye)
        set_mat(eye, eye_m)
        pupil = sph(0.065, T(s * 0.25, 0.28, 0.51), scale=(1.1, 1.2, 0.7))
        smooth_shade(pupil)
        set_mat(pupil, pupil_m)
        roots += [eye, pupil]

    foot_m = material('gobFoot', color=0x54381c)
    for s in (-1, 1):
        f = sph(0.13, T(s * 0.2, -0.6, 0.08), scale=(1.0, 0.6, 1.5))
        smooth_shade(f)
        set_mat(f, foot_m)
        a = sph(0.09, T(s * 0.52, -0.15, 0.12), scale=(0.9, 1.5, 0.9))
        smooth_shade(a)
        set_mat(a, foot_m)
        roots += [f, a]

    # loot sack (scales up as it steals pearls)
    sack = blob([sph(0.34, (0, 0, 0)),
                 sph(0.14, (0.05, 0.02, 0.3), scale=(1, 1, 0.8)),
                 sph(0.08, (0.08, 0.03, 0.42))],
                voxel=0.02, name='sack', ratio=0.5)

    def paint_sack(co):
        c = mix(srgb(0x9a8a5f), srgb(0xb8a878), (co.z + 0.2) / 0.5)
        if co.z > 0.24:
            c = srgb(0x7a6a42)                # tie
        if vnoise(co, 8.0, 61.0) > 0.86:
            c = mix(c, srgb(0x7a6a42), 0.6)   # patches
        return c
    vpaint(sack, paint_sack)
    set_mat(sack, sack_m)
    sack.location = T(-0.5, 0.15, -0.15)
    roots.append(sack)
    return roots


# ================================================================ boss

def boss():
    body_m = material('bossBody', vcol=True, emit=0x232b3f, strength=0.35)
    fin_m = material('bossFin', vcol=True, emit=0x2a3448, strength=0.3, double=True)
    eye_m = material('bossEye', color=0xd05fff, emit=0xb03fe8, strength=1.0)
    mouth_m = material('bossMouth', color=0x1a2030)
    whisk_m = material('bossWhisk', color=0x5a6478, emit=0x2a3448, strength=0.3)
    heart_m = material('bossHeart', color=0xff3f9e, emit=0xff5fbe, strength=1.0)

    def paint_boss(co):
        c = mix(srgb(0x3a4458), srgb(0x8a94a8), (-co.z - 0.4) / 1.6)   # pale belly
        c = mix(c, srgb(0x2a3140), (co.z - 0.8) / 1.6)                 # dark back
        if co.z > -0.4 and vnoise(co, 1.6, 71.0) > 0.72:
            c = mix(c, srgb(0x4a5670), 0.55)                           # mottling
        return c

    body = blob([
        sph(1.95, T(1.2, 0.1, 0), scale=(1.1, 1.0, 1.0)),
        sph(2.0, T(-0.2, 0.05, 0), scale=(1.15, 0.95, 0.98)),
        sph(1.7, T(-1.8, 0.0, 0)),
        sph(1.3, T(-3.1, -0.05, 0)),
        sph(1.7, T(0.4, -0.75, 0), scale=(1.4, 0.75, 1.0)),      # belly
    ], voxel=0.1, name='body', ratio=0.35)
    vpaint(body, paint_boss)
    set_mat(body, body_m)
    roots = [body]

    # head group
    head = empty('head', T(4.1, 0.15, 0))
    hm = blob([
        sph(2.15, (0, 0, 0.05), scale=(1.12, 0.95, 0.9)),
        sph(1.5, T(1.15, 0.05, 0), scale=(0.95, 1.15, 0.62)),    # broad snout
        sph(0.85, T(1.2, -0.55, 1.15)), sph(0.85, T(1.2, -0.55, -1.15)),  # jowls
        sph(0.7, T(0.7, 0.95, 0.9)), sph(0.7, T(0.7, 0.95, -0.9)),        # brows
    ], voxel=0.08, name='headMesh', ratio=0.35)
    vpaint(hm, paint_boss)
    set_mat(hm, body_m)
    kids = [hm]

    mouth = blob([sph(1.0, (0, 0, 0), scale=(0.85, 1.5, 0.26))],
                 voxel=0.05, name='mouth', ratio=0.5)
    set_mat(mouth, mouth_m)
    mouth.location = T(1.8, -1.1, 0)
    kids.append(mouth)

    pupil_m = material('bossPupil', color=0x2a1040, rough=0.3)
    for s, nm in ((-1, 'eyeR'), (1, 'eyeL')):
        eye = sph(0.52, T(1.25, 0.85, s * 1.6), seg=18, rings=14, name=nm)
        smooth_shade(eye)
        set_mat(eye, eye_m)
        pupil = sph(0.2, T(1.6, 0.95, s * 1.85), scale=(1.1, 1.3, 0.8))
        smooth_shade(pupil)
        set_mat(pupil, pupil_m)
        kids += [eye, pupil]

    # four drooping whisker barbels (slam telegraph raises these),
    # anchored at the snout and curving forward-out-down
    from lib import poly_tube
    for i in range(4):
        s = -1 if i < 2 else 1
        k = i % 2
        L = 3.4 - k * 1.2
        # path in blender coords: +x fwd, y = -three_z (sideways), z up
        pts = [(L * t * 0.85, -s * L * t * 0.55, -L * (t * t) * 0.75 + math.sin(t * 9) * 0.05)
               for t in [j / 9 for j in range(10)]]
        w = poly_tube(pts, tube=0.17 - k * 0.05, taper=0.94, name='whisker%d' % i)
        w.location = T(1.75 + k * 0.2, -0.3 - k * 0.25, s * (1.05 + k * 0.4))
        smooth_shade(w)
        set_mat(w, whisk_m)
        kids.append(w)
    parent(kids, head)
    roots.append(head)

    # fins
    dorsal = ico(1.0, T(-0.5, 2.3, 0), scale=(1.5, 0.09, 0.9), sub=3, name='dorsal')
    apply_xf(dorsal)
    smooth_shade(dorsal)
    vpaint(dorsal, lambda co: mix(srgb(0x3a4458), srgb(0x7a5fd0), (co.z - 1.9) / 1.2))
    set_mat(dorsal, fin_m)
    roots.append(dorsal)
    for s in (-1, 1):
        f = ico(1.0, T(1.7, -1.0, s * 2.0), scale=(1.0, 0.55, 0.12), sub=3, name='sidefin%d' % (s > 0))
        f.rotation_euler = (s * 0.9, 0, -0.3)
        smooth_shade(f)
        set_mat(f, fin_m)
        roots.append(f)

    tail = empty('tail', T(-4.2, 0, 0))
    tf = blob([sph(1.0, T(-0.9, 0.1, 0), scale=(0.9, 0.16, 1.1)),
               sph(0.8, T(-1.8, 0.3, 0), scale=(0.5, 0.12, 1.3))],
              voxel=0.06, name='tailFin', ratio=0.4)
    vpaint(tf, lambda co: mix(srgb(0x3a4458), srgb(0x7a5fd0), (-co.x - 1.2) / 1.4))
    set_mat(tf, fin_m)
    parent([tf], tail)
    roots.append(tail)

    # corruption crystals (game shatters them as hp drops) + heart crystal
    cm = _corrupt_mat()
    crys_pos = [(-2.6, 1.7, 0.4), (-1.2, 2.0, -0.6), (0.4, 2.2, 0.5),
                (1.8, 1.9, -0.4), (-0.2, 1.9, 1.1), (-1.8, 1.8, 0.9)]
    for i, (cx, cy, cz) in enumerate(crys_pos):
        c = _crystal_spike(0.5, 1.9, (0, 0, 0), seed=40 + i)
        c.name = 'crystal%d' % i
        c.location = T(cx, cy + 0.5, cz)
        c.rotation_euler = (math.sin(i * 2.7) * 0.4, math.cos(i * 1.9) * 0.4, i * 1.1)
        set_mat(c, cm)
        roots.append(c)

    lower = cone(r1=0.85, r2=0.0, depth=0.95, at=(0, 0, -0.475), verts=4)
    lower.rotation_euler = (math.pi, 0, 0)
    apply_xf(lower)
    heart = join([cone(r1=0.85, r2=0.0, depth=0.95, at=(0, 0, 0.475), verts=4), lower], 'heart')
    smooth_shade(heart, False)
    heart.location = T(2.2, 1.4, 0)
    set_mat(heart, heart_m)
    roots.append(heart)
    return roots


ASSETS = {
    'axolotl': (axolotl, dict(azim=62, elev=14, zoom=1.05)),
    'axolotl_baby': (axolotl_baby, dict(azim=55, elev=18, zoom=1.0)),
    'crab': (crab, dict(azim=55, elev=22)),
    'vine': (vine, dict(azim=40, elev=10, zoom=0.95)),
    'frog': (frog, dict(azim=15, elev=16)),
    'bug': (bug, dict(azim=50, elev=25)),
    'turtle': (turtle, dict(azim=55, elev=22)),
    'eel_head': (eel_head, dict(azim=55, elev=18)),
    'eel_seg': (eel_seg, dict(azim=55, elev=18)),
    'goblin': (goblin, dict(azim=15, elev=14)),
    'boss': (boss, dict(azim=55, elev=16)),
}
