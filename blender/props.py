# Axolotl Guardian — world props, architecture, pickups, cosmetics.
# Instanced assets (reed, cattail, lilypad, rock...) are single-mesh /
# single-material so the game can feed them to THREE.InstancedMesh via G.assets.geo().

import math
import importlib
from mathutils import Vector
import lib
importlib.reload(lib)
from lib import (T, sph, ico, cone, cyl, box, torus, arc_tube, poly_tube, empty,
                 join, apply_xf, blob, decimate, smooth_shade, jitter, duplicate,
                 parent, srgb, mix, vpaint, vnoise, material, set_mat)

# palettes
GRASS = srgb(0x57a552)
GRASS_DK = srgb(0x2f7a42)
BARK = srgb(0x6b4a30)
BARK_DK = srgb(0x54381c)
STONE = srgb(0x9aa89b)
STONE_DK = srgb(0x6f7a6e)
MOSS = srgb(0x5a8a52)
GOLD = srgb(0xffd85f)


def _displace(o, fn):
    for v in o.data.vertices:
        v.co = fn(v.co)
    return o


# ================================================================ vegetation

def reed():
    m = material('reedMat', vcol=True)
    stalk = cone(r1=0.085, r2=0.02, depth=2.6, at=(0, 0, 1.3), verts=5)
    smooth_shade(stalk)
    leaves = []
    for i, (a, h, l) in enumerate([(0.4, 0.7, 0.75), (2.6, 1.3, 0.6)]):
        lf = ico(1.0, (math.cos(a) * 0.28, math.sin(a) * 0.28, h),
                 scale=(0.3, 0.05, 0.09), sub=1)
        lf.rotation_euler = (0, -0.6, a)
        smooth_shade(lf)
        leaves.append(lf)
    o = join([stalk] + leaves, 'reed')
    apply_xf(o)
    # gentle wind-lean
    _displace(o, lambda co: Vector((co.x + co.z * co.z * 0.055, co.y, co.z)))
    vpaint(o, lambda co: mix(srgb(0x3f7a35), srgb(0x8fc06a), co.z / 2.6))
    set_mat(o, m)
    return [o]


def cattail():
    m = material('cattailMat', vcol=True)
    stem = cone(r1=0.05, r2=0.035, depth=2.5, at=(0, 0, 1.25), verts=5)
    smooth_shade(stem)
    head = cyl(0.13, 0.62, (0, 0, 2.6), verts=8)
    smooth_shade(head)
    tip = cone(r1=0.02, r2=0.004, depth=0.35, at=(0, 0, 3.05), verts=4)
    smooth_shade(tip)
    lf = ico(1.0, (0.22, 0.05, 1.1), scale=(0.42, 0.05, 0.1), sub=1)
    lf.rotation_euler = (0, -0.75, 0.3)
    smooth_shade(lf)
    o = join([stem, head, tip, lf], 'cattail')
    apply_xf(o)
    _displace(o, lambda co: Vector((co.x + co.z * co.z * 0.03, co.y, co.z)))

    def paint(co):
        r = math.sqrt(co.x * co.x + co.y * co.y)
        if 2.28 < co.z < 2.95 and r > 0.06:
            return mix(srgb(0x7a4a26), srgb(0x9a6236), vnoise(co, 9.0))
        return mix(srgb(0x4f8f3f), srgb(0x9fc46a), co.z / 3.0)
    vpaint(o, paint)
    set_mat(o, m)
    return [o]


def _pad_mesh(name, r=1.0, depth=0.08, notch=True):
    o = cone(r1=r * 0.99, r2=r, depth=depth, at=(0, 0, 0), verts=26)
    apply_xf(o)
    me = o.data

    def d(co):
        a = math.atan2(co.y, co.x)
        rr = math.sqrt(co.x * co.x + co.y * co.y)
        f = 1.0
        if notch and abs(a) < 0.42:
            f = 1.0 - (0.42 - abs(a)) / 0.42 * 0.55 * (rr / r)
        z = co.z + (max(0.0, rr * f / r - 0.72)) * 0.3 * r   # upturned rim
        z += math.sin(a * 7 + 1) * 0.015 * rr                # ripple
        return Vector((co.x * f, co.y * f, z))
    _displace(o, d)
    smooth_shade(o)
    o.name = name
    return o


def lilypad():
    m = material('lilypadMat', vcol=True)
    o = _pad_mesh('lilypad')

    def paint(co):
        rr = math.sqrt(co.x * co.x + co.y * co.y)
        a = math.atan2(co.y, co.x)
        c = mix(GRASS_DK, GRASS, rr)
        if abs(math.sin(a * 9 + 0.5)) > 0.93 and rr > 0.2:
            c = mix(c, GRASS_DK, 0.55)          # radial veins
        if rr > 0.9:
            c = mix(c, srgb(0x8a6a3a), 0.3)     # sun-worn edge
        if co.z < 0.0:
            c = srgb(0x35543a)
        return c
    vpaint(o, paint)
    set_mat(o, m)
    return [o]


def lilypad_big():
    m = material('lilypadBigMat', vcol=True)
    o = _pad_mesh('lilypadBig', depth=0.16, notch=True)

    def paint(co):
        rr = math.sqrt(co.x * co.x + co.y * co.y)
        a = math.atan2(co.y, co.x)
        c = mix(srgb(0x24704a), srgb(0x3f9c5c), rr)
        if abs(math.sin(a * 11)) > 0.9 and rr > 0.15:
            c = mix(c, srgb(0x1d5a3c), 0.6)
        if rr > 0.88:
            c = mix(c, srgb(0x67b06a), 0.5)     # bright rolled rim
        if co.z < 0.02:
            c = srgb(0x2a4a3a)
        return c
    vpaint(o, paint)
    set_mat(o, m)
    return [o]


def lotus():
    m = material('lotusMat', vcol=True, emit=0xff5f9e, strength=0.35)
    petals = []
    for ring, (n, tilt, sc, zb) in enumerate([(6, 0.95, 1.0, 0.05), (5, 0.55, 0.72, 0.16)]):
        for i in range(n):
            a = i / n * math.tau + ring * 0.5
            p = ico(1.0, (math.cos(a) * 0.16 * sc, math.sin(a) * 0.16 * sc, zb),
                    scale=(0.22 * sc, 0.11 * sc, 0.05), sub=1)
            p.rotation_euler = (0, -tilt, a)
            smooth_shade(p)
            petals.append(p)
    heart = sph(0.09, (0, 0, 0.2), seg=12, rings=8)
    smooth_shade(heart)
    o = join(petals + [heart], 'lotus')
    apply_xf(o)

    def paint(co):
        if co.z > 0.16 and math.sqrt(co.x * co.x + co.y * co.y) < 0.11:
            return srgb(0xffd85f)               # golden heart
        rr = math.sqrt(co.x * co.x + co.y * co.y)
        return mix(srgb(0xff9fce), srgb(0xffe0ee), co.z * 2.2 + rr * 0.6)
    vpaint(o, paint)
    set_mat(o, m)
    return [o]


def _tree(seed, lean=0.12, blobs=3, h=5.2, name='tree'):
    bark_m = material('barkMat', vcol=True)
    leaf_m = material('leafMat', vcol=True)
    # trunk: curved taper + root flare
    pts = [(math.sin(t * 2 + seed) * lean * t * h, math.cos(t * 3 + seed) * lean * 0.5 * t * h, t * h)
           for t in [i / 6 for i in range(7)]]
    trunk = poly_tube(pts, tube=0.52, taper=0.55, tseg=8, name='trunk')
    roots_parts = [trunk]
    for i in range(5):
        a = i / 5 * math.tau + seed
        r = sph(0.3, (math.cos(a) * 0.42, math.sin(a) * 0.42, 0.05), scale=(1.4, 1.0, 0.7))
        roots_parts.append(r)
    trunk = blob(roots_parts, voxel=0.07, name='trunk', ratio=0.4)

    def paint_bark(co):
        c = mix(BARK_DK, BARK, vnoise(co, 2.0, seed))
        if vnoise(Vector((co.x * 0.3, co.y * 0.3, co.z)), 6.0, seed * 3) > 0.75:
            c = mix(c, BARK_DK, 0.6)            # bark streaks
        if co.z < 0.4:
            c = mix(c, MOSS, 0.45 * (0.4 - co.z))
        return c
    vpaint(trunk, paint_bark)
    set_mat(trunk, bark_m)
    out = [trunk]

    top = Vector(pts[-1])
    canopy_parts = []
    rnd = lambda k, a, b: a + (vnoise(Vector((k * 1.7, seed, k)), 1.0) % 1.0) * (b - a)
    for i in range(blobs):
        a = i / blobs * math.tau + seed * 2
        c = sph(rnd(i, 1.6, 2.3),
                (top.x + math.cos(a) * 1.15, top.y + math.sin(a) * 1.15,
                 top.z + 0.5 + rnd(i + 9, 0, 0.9)),
                scale=(1.0, 1.0, 0.75))
        canopy_parts.append(c)
    canopy_parts.append(sph(1.7, (top.x, top.y, top.z + 1.6), scale=(1, 1, 0.8)))
    canopy = blob(canopy_parts, voxel=0.12, name='canopy', ratio=0.35)
    # droopy willow fringe
    fringe = []
    for i in range(7):
        a = i / 7 * math.tau + 0.3
        f = ico(1.0, (top.x + math.cos(a) * 2.1, top.y + math.sin(a) * 2.1, top.z + 0.15),
                scale=(0.32, 0.32, 0.75), sub=2)
        fringe.append(f)
    canopy = blob([canopy] + fringe, voxel=0.12, name='canopy', ratio=0.4)

    def paint_leaf(co):
        c = mix(srgb(0x2f7a3c), srgb(0x7ac06a), (co.z - top.z) / 3.2 + vnoise(co, 1.4, seed) * 0.35)
        if vnoise(co, 3.2, seed * 7) > 0.86:
            c = mix(c, srgb(0xa8d87a), 0.6)     # light-catching tips
        return c
    vpaint(canopy, paint_leaf)
    set_mat(canopy, leaf_m)
    out.append(canopy)
    return out


def tree():
    return _tree(1.7, lean=0.14, blobs=3, h=5.0)


def tree2():
    return _tree(4.2, lean=0.07, blobs=2, h=6.0)


def rock():
    m = material('rockMat', vcol=True, rough=0.95)
    o = ico(1.0, (0, 0, 0.25), scale=(1.15, 1.0, 0.8), sub=2, name='rock')
    apply_xf(o)
    jitter(o, 0.14, 5)
    smooth_shade(o, False)

    def paint(co):
        c = mix(srgb(0x7a7c80), srgb(0xa0a2a6), vnoise(co, 2.5, 9.0))
        if co.z > 0.35 + vnoise(co, 3.0, 4.0) * 0.4:
            c = mix(c, MOSS, 0.75)
        return c
    vpaint(o, paint)
    set_mat(o, m)
    return [o]


def rock2():
    m = material('rock2Mat', vcol=True, rough=0.95)
    o = ico(1.0, (0, 0, 0.2), scale=(1.0, 1.3, 0.7), sub=2, name='rock2')
    apply_xf(o)
    jitter(o, 0.2, 11)
    smooth_shade(o, False)

    def paint(co):
        c = mix(srgb(0x6f7276), srgb(0x94969a), vnoise(co, 2.2, 21.0))
        if co.z > 0.28 + vnoise(co, 2.6, 14.0) * 0.35:
            c = mix(c, srgb(0x4f7a48), 0.7)
        return c
    vpaint(o, paint)
    set_mat(o, m)
    return [o]


def mushroom():
    m = material('mushMat', vcol=True, emit=0x3fd8ff, strength=0.9)
    parts = []
    for (mx, my, r, h) in [(0, 0, 0.42, 0.5), (0.35, 0.2, 0.26, 0.3), (-0.28, 0.18, 0.2, 0.22)]:
        st = cyl(r * 0.28, h, (mx, my, h / 2), verts=8)
        smooth_shade(st)
        cap = sph(r, (mx, my, h + r * 0.25), scale=(1, 1, 0.62), seg=16, rings=12)
        smooth_shade(cap)
        parts += [st, cap]
    o = join(parts, 'mushroom')
    apply_xf(o)

    def paint(co):
        rr = math.sqrt(co.x * co.x + co.y * co.y)
        if co.z < 0.28 and rr < 0.16:
            return srgb(0xd8e8e8)               # stems
        c = mix(srgb(0x4fc8e8), srgb(0x8fe8ff), co.z)
        if vnoise(co, 9.0, 33.0) > 0.86:
            c = srgb(0xe8fbff)                  # glow spots
        return c
    vpaint(o, paint)
    set_mat(o, m)
    return [o]


def log():
    m = material('logMat', vcol=True)
    body = cyl(0.72, 7.0, (0, 0, 0), verts=12)
    body.rotation_euler = (0, math.radians(90), 0)
    apply_xf(body)
    knots = [sph(0.28, (1.4, 0.3, 0.55)), sph(0.24, (-1.8, -0.35, 0.5)),
             sph(0.5, (3.5, 0, 0), scale=(0.3, 1, 1)), sph(0.5, (-3.5, 0, 0), scale=(0.3, 1, 1))]
    o = blob([body] + knots, voxel=0.09, name='log', ratio=0.4)

    def paint(co):
        if abs(co.x) > 3.32:
            ring = math.sqrt(co.y * co.y + co.z * co.z)
            c = mix(srgb(0xc09a62), srgb(0x8a6236), abs(math.sin(ring * 9)))  # end rings
            return c
        c = mix(srgb(0x6a4a2c), srgb(0x8a6236), vnoise(co, 3.0, 41.0))
        if co.z > 0.3:
            c = mix(c, MOSS, 0.55 + vnoise(co, 5.0, 12.0) * 0.3)
        return c
    vpaint(o, paint)
    set_mat(o, m)
    return [o]


# ================================================================ architecture

def _stone_paint(seed):
    def paint(co):
        c = mix(STONE_DK, STONE, vnoise(co, 2.0, seed))
        if vnoise(co, 4.5, seed * 2 + 3) > 0.78:
            c = mix(c, MOSS, 0.65)              # moss patches
        return c
    return paint


def _fluted_shaft(name, broken=False):
    o = cone(r1=1.06, r2=0.94, depth=1.0, at=(0, 0, 0.5), verts=24)
    apply_xf(o)

    def d(co):
        a = math.atan2(co.y, co.x)
        rr = math.sqrt(co.x * co.x + co.y * co.y)
        if rr > 0.1:
            f = 1.0 - max(0.0, math.sin(a * 9)) * 0.09
            co = Vector((co.x * f, co.y * f, co.z))
        if broken and co.z > 0.82:
            drop = vnoise(Vector((math.cos(a) * 2, math.sin(a) * 2, 0)), 1.3, 8.0) * 0.3
            co = Vector((co.x, co.y, min(co.z, 1.0 - drop)))
        return co
    _displace(o, d)
    smooth_shade(o)
    o.name = name
    return o


def column():
    m = material('colStone', vcol=True)
    base = box(2.5, 2.5, 0.5, (0, 0, 0.25), name='base')
    top2 = box(2.1, 2.1, 0.28, (0, 0, 0.62), name='b2')
    base = join([base, top2], 'base')
    apply_xf(base)
    smooth_shade(base, False)
    vpaint(base, _stone_paint(1.0))
    set_mat(base, m)

    shaft = _fluted_shaft('shaft')
    vpaint(shaft, _stone_paint(2.0))
    set_mat(shaft, m)

    cap1 = box(2.2, 2.2, 0.26, (0, 0, 0.13))
    cap2 = box(2.7, 2.7, 0.3, (0, 0, 0.42))
    cap = join([cap1, cap2], 'cap')
    apply_xf(cap)
    smooth_shade(cap, False)
    vpaint(cap, _stone_paint(3.0))
    set_mat(cap, m)
    cap.location = (0, 0, 1.0)   # JS repositions to shaft height
    return [base, shaft, cap]


def column_broken():
    m = material('colStoneB', vcol=True)
    base = box(2.5, 2.5, 0.5, (0, 0, 0.25), name='base')
    apply_xf(base)
    smooth_shade(base, False)
    vpaint(base, _stone_paint(4.0))
    set_mat(base, m)

    shaft = _fluted_shaft('shaft', broken=True)
    vpaint(shaft, _stone_paint(5.0))
    set_mat(shaft, m)

    rubble = []
    for i, (rx, ry, rs) in enumerate([(1.3, 0.5, 0.35), (-1.1, -0.8, 0.28), (0.6, -1.3, 0.22)]):
        r = ico(rs, (rx, ry, rs * 0.5), sub=1)
        jitter(r, rs * 0.3, 60 + i)
        smooth_shade(r, False)
        rubble.append(r)
    rub = join(rubble, 'rubble')
    apply_xf(rub)
    vpaint(rub, _stone_paint(6.0))
    set_mat(rub, m)
    return [base, shaft, rub]


def lintel():
    m = material('lintelStone', vcol=True)
    main = box(1.0, 0.42, 0.3, (0, 0, 0.15))
    crown = box(0.86, 0.5, 0.12, (0, 0, 0.36))
    teeth = []
    for i in range(5):
        t = box(0.08, 0.46, 0.1, (-0.4 + i * 0.2, 0, 0.47))
        teeth.append(t)
    o = join([main, crown] + teeth, 'lintel')
    apply_xf(o)
    smooth_shade(o, False)
    vpaint(o, _stone_paint(7.0))
    set_mat(o, m)
    return [o]


def altar():
    m = material('altarStone', vcol=True, emit=0x2f4f4a, strength=0.25)
    b = cone(r1=1.15, r2=0.92, depth=0.75, at=(0, 0, 0.375), verts=10)
    smooth_shade(b, False)
    topd = cyl(1.02, 0.18, (0, 0, 0.84), verts=10)
    smooth_shade(topd, False)
    ring = torus(0.78, 0.045, (0, 0, 0.95), mseg=24, tseg=6)
    smooth_shade(ring)
    o = join([b, topd, ring], 'altar')
    apply_xf(o)

    def paint(co):
        rr = math.sqrt(co.x * co.x + co.y * co.y)
        if co.z > 0.9 and 0.7 < rr < 0.86:
            return srgb(0x7fe8d0)               # glowing rune ring
        c = mix(srgb(0x5f7a6c), srgb(0x8f9e93), vnoise(co, 2.4, 51.0))
        if vnoise(co, 5.0, 52.0) > 0.8:
            c = mix(c, MOSS, 0.5)
        return c
    vpaint(o, paint)
    set_mat(o, m)
    return [o]


def gatepost():
    bark_m = material('gateBark', vcol=True)
    leaf_m = material('gateLeaf', vcol=True, emit=0x3f6f2f, strength=0.3)
    pts = [(math.sin(t * 2.2) * 0.35 * t, math.cos(t * 1.7) * 0.2 * t, t * 8.0)
           for t in [i / 7 for i in range(8)]]
    post = poly_tube(pts, tube=0.75, taper=0.45, tseg=9, name='post')
    # vine wrap
    helix = [(math.cos(t * 11) * (0.6 - t * 0.24), math.sin(t * 11) * (0.6 - t * 0.24),
              t * 7.6 + 0.2) for t in [i / 30 for i in range(31)]]
    wrap = poly_tube(helix, tube=0.15, taper=0.35, tseg=6, name='wrap')
    post = blob([post, wrap], voxel=0.09, name='post', ratio=0.4)

    def paint_post(co):
        c = mix(srgb(0x4f6a3a), srgb(0x6f8f5f), vnoise(co, 2.0, 61.0))
        if co.z < 1.0:
            c = mix(c, MOSS, 0.5)
        return c
    vpaint(post, paint_post)
    set_mat(post, bark_m)

    tuft_parts = []
    top = Vector(pts[-1])
    for i in range(4):
        a = i / 4 * math.tau
        tuft_parts.append(sph(0.5, (top.x + math.cos(a) * 0.4, top.y + math.sin(a) * 0.4, 7.9),
                              scale=(1, 1, 0.7)))
    tuft = blob(tuft_parts, voxel=0.07, name='tuft', ratio=0.5)
    vpaint(tuft, lambda co: mix(srgb(0x3f8f45), srgb(0x8fd07a), (co.z - 7.4) + vnoise(co, 3.0, 15.0) * 0.4))
    set_mat(tuft, leaf_m)
    return [post, tuft]


def shrine():
    m = material('shrineStone', vcol=True)
    base = cone(r1=1.9, r2=1.5, depth=0.5, at=(0, 0, 0.25), verts=9)
    smooth_shade(base, False)
    mid = _fluted_shaft('mid')
    mid.scale = (0.55, 0.55, 0.9)
    apply_xf(mid)
    mid.location = (0, 0, 0.5)
    apply_xf(mid)
    bowl = torus(0.62, 0.16, (0, 0, 1.5), mseg=18, tseg=8)
    smooth_shade(bowl)
    disc = cyl(0.62, 0.12, (0, 0, 1.44), verts=18)
    smooth_shade(disc, False)
    o = join([base, mid, bowl, disc], 'shrine')
    apply_xf(o)
    vpaint(o, _stone_paint(9.0))
    set_mat(o, m)
    return [o]


# ================================================================ crystals

def _crystal_cluster(name, color, emit, strength, seeds):
    m = material(name + 'Mat', color=color, emit=emit, strength=strength, rough=0.2)
    rock_m = material(name + 'Rock', vcol=True)
    spikes = []
    for i, (x, y, r, h, tilt) in enumerate(seeds):
        c = cone(r1=r, r2=r * 0.14, depth=h, at=(x, y, h * 0.42), verts=5)
        c.rotation_euler = (math.sin(i * 2.4) * tilt, math.cos(i * 1.7) * tilt, i * 0.9)
        apply_xf(c, loc=False)
        jitter(c, r * 0.14, i + 3)
        smooth_shade(c, False)
        set_mat(c, m)
        spikes.append(c)
    o = join(spikes, name)
    apply_xf(o)
    base_parts = [sph(0.5, (0.1, 0, -0.05), scale=(1.5, 1.3, 0.5)),
                  sph(0.35, (-0.5, 0.3, -0.02), scale=(1.2, 1, 0.5))]
    base = blob(base_parts, voxel=0.06, name=name + 'Base', ratio=0.5)
    vpaint(base, lambda co: mix(srgb(0x3a4048), srgb(0x5a626e), vnoise(co, 3.0, 25.0)))
    set_mat(base, rock_m)
    return [o, base]


def crystal():
    return _crystal_cluster('crystal', 0x3fd8d4, 0x2fc8e8, 1.1,
                            [(0, 0, 0.34, 2.0, 0.3), (0.45, 0.25, 0.22, 1.2, 0.5),
                             (-0.4, 0.2, 0.26, 1.4, 0.45), (0.1, -0.42, 0.2, 0.95, 0.55),
                             (-0.25, -0.3, 0.15, 0.7, 0.6)])


def crystal_dark():
    return _crystal_cluster('crystalDark', 0x8a2fb8, 0xb03fe8, 1.25,
                            [(0, 0, 0.36, 2.2, 0.35), (0.5, 0.2, 0.24, 1.3, 0.5),
                             (-0.42, 0.25, 0.28, 1.5, 0.4), (0.05, -0.45, 0.18, 0.85, 0.6)])


def crystal_shard():
    m = material('shardMat', color=0x8a2fb8, emit=0xb03fe8, strength=0.9, rough=0.2)
    c = cone(r1=0.68, r2=0.09, depth=3.0, at=(0, 0, 1.35), verts=5, name='shard')
    apply_xf(c)
    jitter(c, 0.09, 7)
    smooth_shade(c, False)
    set_mat(c, m)
    return [c]


def stone_marker():
    m = material('markerMat', color=0xffb84f, emit=0xff9f2f, strength=0.8, rough=0.4)
    c = cone(r1=0.5, r2=0.14, depth=1.8, at=(0, 0, 0.8), verts=6, name='marker')
    apply_xf(c)
    jitter(c, 0.1, 13)
    smooth_shade(c, False)
    set_mat(c, m)
    return [c]


# ================================================================ pickups

def chest():
    wood_m = material('chestWood', vcol=True)
    gold_m = material('chestGold', color=0xffd85f, emit=0xdd9f2f, strength=0.4, rough=0.35)

    base = box(1.2, 0.8, 0.62, (0, 0, 0.31), name='chestBase')
    apply_xf(base)
    smooth_shade(base, False)

    def paint_wood(co):
        c = mix(srgb(0x6f4526), srgb(0x8a5a32), abs(math.sin(co.x * 9.0)))
        return mix(c, srgb(0x5a3a20), vnoise(co, 5.0, 71.0) * 0.4)
    vpaint(base, paint_wood)
    set_mat(base, wood_m)

    # lid: half-barrel, object origin at the back hinge line
    lid_mesh = cyl(0.42, 1.16, (0, 0, 0), verts=14)
    lid_mesh.rotation_euler = (0, math.radians(90), 0)
    apply_xf(lid_mesh)
    _displace(lid_mesh, lambda co: Vector((co.x, co.y, co.z * 0.35 if co.z < 0 else co.z)))
    smooth_shade(lid_mesh)
    vpaint(lid_mesh, paint_wood)
    set_mat(lid_mesh, wood_m)
    lid = empty('lid', (0, 0.4, 0.62))
    lid_mesh.location = (0, -0.4, 0.05)
    parent([lid_mesh], lid)

    trims = []
    for tx in (-0.42, 0.42):
        tr = box(0.1, 0.84, 0.66, (tx, 0, 0.33))
        trims.append(tr)
    clasp = box(0.18, 0.1, 0.24, (0, -0.42, 0.55))
    trims.append(clasp)
    trim = join(trims, 'trim')
    apply_xf(trim)
    smooth_shade(trim, False)
    set_mat(trim, gold_m)
    return [base, lid, trim]


def relic():
    m = material('relicGold', vcol=True, emit=0xffb82f, strength=0.9, rough=0.3)
    # tiny golden axolotl idol curled on a ring
    ring = torus(0.42, 0.09, (0, 0, 0.06), mseg=20, tseg=7)
    smooth_shade(ring)
    body = blob([
        sph(0.16, (0.2, 0, 0.28)), sph(0.2, (0, 0.12, 0.3)),
        sph(0.15, (-0.2, 0.02, 0.28)), sph(0.11, (-0.3, -0.18, 0.26)),
        sph(0.23, (0.24, -0.05, 0.42)),   # head
    ], voxel=0.03, name='idol', ratio=0.5)
    o = join([ring, body], 'relic')
    apply_xf(o)
    vpaint(o, lambda co: mix(srgb(0xffd85f), srgb(0xb8862f), vnoise(co, 4.0, 81.0) * 0.5 + (0.3 - co.z)))
    set_mat(o, m)
    return [o]


def heart_pickup():
    m = material('heartMat', color=0xff7a9e, emit=0xff3f7a, strength=0.9)
    o = blob([sph(0.3, (-0.18, 0, 0.1)), sph(0.3, (0.18, 0, 0.1)),
              sph(0.24, (0, 0, -0.18), scale=(1.3, 0.9, 1.4))],
             voxel=0.03, name='heart', ratio=0.4)
    _displace(o, lambda co: Vector((co.x, co.y * 0.62, co.z - min(0.0, co.z + 0.1) * 0.6)))
    smooth_shade(o)
    set_mat(o, m)
    return [o]


# ================================================================ cosmetics

def hat_lily():
    m = material('hatLilyMat', vcol=True)
    pad = _pad_mesh('hatPad', r=0.42, depth=0.05)
    vpaint(pad, lambda co: mix(GRASS_DK, GRASS, math.sqrt(co.x ** 2 + co.y ** 2) / 0.42))
    set_mat(pad, m)
    fl = lotus()[0]
    fl.name = 'hatFlower'
    fl.scale = (0.55, 0.55, 0.55)
    fl.location = (0, 0, 0.05)
    return [pad, fl]


def hat_shell():
    m = material('hatShellMat', vcol=True)
    # log-spiral snail shell
    pts = []
    for i in range(46):
        t = i / 45
        a = t * math.tau * 2.6
        r = 0.34 * (1 - t * 0.85)
        pts.append((math.cos(a) * r, math.sin(a) * r, 0.1 + t * 0.28))
    o = poly_tube(pts, tube=0.16, taper=0.8, tseg=8, name='shell')
    smooth_shade(o)

    def paint(co):
        stripe = abs(math.sin(math.atan2(co.y, co.x) * 2 + co.z * 6))
        return mix(srgb(0xd8a05f), srgb(0x9a6a3a), stripe)
    vpaint(o, paint)
    set_mat(o, m)
    return [o]


def hat_scarf():
    m = material('scarfMat', vcol=True)
    band = torus(0.5, 0.13, (0, 0, 0), mseg=18, tseg=8)
    smooth_shade(band)
    tails = []
    for i, (a, l) in enumerate([(2.6, 0.55), (2.9, 0.4)]):
        t = ico(1.0, (math.cos(a) * 0.5, math.sin(a) * 0.5, -0.28 - i * 0.12),
                scale=(0.12, 0.05, 0.3), sub=2)
        t.rotation_euler = (0.3, 0.2, a)
        smooth_shade(t)
        tails.append(t)
    o = join([band] + tails, 'scarf')
    apply_xf(o)
    vpaint(o, lambda co: mix(srgb(0xff8a3f), srgb(0xffb36a), vnoise(co, 6.0, 91.0) * 0.4 - co.z * 0.8))
    set_mat(o, m)
    return [o]


def hat_crown():
    m = material('crownMat', color=0xffe98a, emit=0xffd84f, strength=0.9, rough=0.3)
    gem_m = material('crownGem', color=0x4fd8ff, emit=0x4fd8ff, strength=1.2, rough=0.2)
    band = torus(0.3, 0.05, (0, 0, 0), mseg=16, tseg=6)
    smooth_shade(band)
    spikes = []
    for i in range(5):
        a = i / 5 * math.tau
        sp = cone(r1=0.07, r2=0.008, depth=0.28, at=(math.cos(a) * 0.3, math.sin(a) * 0.3, 0.14), verts=5)
        smooth_shade(sp, False)
        spikes.append(sp)
    o = join([band] + spikes, 'crown')
    apply_xf(o)
    set_mat(o, m)
    gem = sph(0.06, (0.3, 0, 0.05), seg=8, rings=6, name='gem')
    smooth_shade(gem, False)
    set_mat(gem, gem_m)
    return [o, gem]


ASSETS = {
    'reed': (reed, dict(azim=30, elev=8)),
    'cattail': (cattail, dict(azim=30, elev=8)),
    'lilypad': (lilypad, dict(azim=30, elev=55)),
    'lilypad_big': (lilypad_big, dict(azim=30, elev=55)),
    'lotus': (lotus, dict(azim=30, elev=40)),
    'tree': (tree, dict(azim=30, elev=8, zoom=0.95)),
    'tree2': (tree2, dict(azim=30, elev=8, zoom=0.95)),
    'rock': (rock, dict(azim=30, elev=25)),
    'rock2': (rock2, dict(azim=30, elev=25)),
    'mushroom': (mushroom, dict(azim=30, elev=18)),
    'log': (log, dict(azim=30, elev=25)),
    'column': (column, dict(azim=30, elev=10)),
    'column_broken': (column_broken, dict(azim=30, elev=12)),
    'lintel': (lintel, dict(azim=30, elev=20)),
    'altar': (altar, dict(azim=30, elev=25)),
    'gatepost': (gatepost, dict(azim=30, elev=8, zoom=0.95)),
    'shrine': (shrine, dict(azim=30, elev=15)),
    'crystal': (crystal, dict(azim=30, elev=15)),
    'crystal_dark': (crystal_dark, dict(azim=30, elev=15)),
    'crystal_shard': (crystal_shard, dict(azim=30, elev=10)),
    'stone_marker': (stone_marker, dict(azim=30, elev=10)),
    'chest': (chest, dict(azim=25, elev=22)),
    'relic': (relic, dict(azim=30, elev=30)),
    'heart_pickup': (heart_pickup, dict(azim=0, elev=15)),
    'hat_lily': (hat_lily, dict(azim=30, elev=25)),
    'hat_shell': (hat_shell, dict(azim=30, elev=25)),
    'hat_scarf': (hat_scarf, dict(azim=30, elev=25)),
    'hat_crown': (hat_crown, dict(azim=30, elev=25)),
}
