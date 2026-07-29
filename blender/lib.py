# Axolotl Guardian — Blender asset toolkit
# Shared helpers: primitives, blob (voxel-remesh) modeling, vertex painting,
# materials, GLB export and Cycles preview renders.
#
# Conventions:
#  - Assets are authored in Blender coords (Z up). The game is three.js (Y up).
#    T(x, y, z) converts a three.js position into Blender coords, so asset
#    scripts can think in the game's coordinate system.
#  - Animated nodes (things game code moves) are separate objects/empties with
#    stable names; game code animates them relative to their exported rest pose.
#  - Color is vertex colors ("Col" attribute) and/or flat material colors.

import bpy
import math
import random
from mathutils import Vector

# ---------------------------------------------------------------- scene

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def T(tx, ty, tz):
    """three.js (x, y-up, z) -> Blender (x, -z, y)."""
    return (tx, -tz, ty)


def _link(o):
    bpy.context.scene.collection.objects.link(o)
    return o


def _active():
    return bpy.context.object

# ---------------------------------------------------------------- primitives

def sph(r=1.0, at=(0, 0, 0), scale=(1, 1, 1), seg=24, rings=16, name=None):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=rings, radius=r, location=at)
    o = _active()
    o.scale = scale
    if name:
        o.name = name
    return o


def ico(r=1.0, at=(0, 0, 0), scale=(1, 1, 1), sub=2, name=None):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=sub, radius=r, location=at)
    o = _active()
    o.scale = scale
    if name:
        o.name = name
    return o


def cone(r1=1.0, r2=0.0, depth=2.0, at=(0, 0, 0), verts=8, scale=(1, 1, 1), name=None):
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r1, radius2=r2, depth=depth, location=at)
    o = _active()
    o.scale = scale
    if name:
        o.name = name
    return o


def cyl(r=1.0, depth=2.0, at=(0, 0, 0), verts=12, scale=(1, 1, 1), name=None):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=at)
    o = _active()
    o.scale = scale
    if name:
        o.name = name
    return o


def box(w=1.0, d=1.0, h=1.0, at=(0, 0, 0), name=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=at)
    o = _active()
    o.scale = (w, d, h)
    if name:
        o.name = name
    return o


def torus(major=1.0, minor=0.25, at=(0, 0, 0), mseg=24, tseg=10, scale=(1, 1, 1), name=None):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor,
                                     major_segments=mseg, minor_segments=tseg, location=at)
    o = _active()
    o.scale = scale
    if name:
        o.name = name
    return o


def arc_tube(r=1.0, tube=0.05, a0=0.0, a1=math.pi, at=(0, 0, 0), seg=14, tseg=6,
             taper=0.0, origin='center', name=None):
    """Open tube swept along an arc in the XY plane (for smiles, bands, whiskers).
    taper: 0 = constant thickness, 1 = shrinks to a point at the a1 end.
    origin: 'center' = arc center, 'start' = first ring sits at object origin."""
    import bmesh
    me = bpy.data.meshes.new(name or 'arc')
    bm = bmesh.new()
    rings = []
    for i in range(seg + 1):
        a = a0 + (a1 - a0) * i / seg
        tb = tube * (1.0 - taper * (i / seg)) + 1e-4
        c = Vector((math.cos(a) * r, math.sin(a) * r, 0))
        # ring frame: radial (in-plane) and z
        rad = Vector((math.cos(a), math.sin(a), 0))
        ring = []
        for j in range(tseg):
            b = j / tseg * math.tau
            p = c + rad * (math.cos(b) * tb) + Vector((0, 0, math.sin(b) * tb))
            ring.append(bm.verts.new(p))
        rings.append(ring)
    for i in range(seg):
        for j in range(tseg):
            a_, b_ = rings[i][j], rings[i][(j + 1) % tseg]
            c_, d_ = rings[i + 1][(j + 1) % tseg], rings[i + 1][j]
            bm.faces.new((a_, b_, c_, d_))
    # cap ends
    bm.faces.new(reversed(rings[0]))
    bm.faces.new(rings[-1])
    if origin == 'start':
        start = Vector((math.cos(a0) * r, math.sin(a0) * r, 0))
        for v in bm.verts:
            v.co -= start
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name or 'arc', me)
    _link(o)
    o.location = at
    return o


def poly_tube(points, tube=0.1, taper=0.9, tseg=6, name=None):
    """Tube swept along a 3D polyline (whiskers, tendrils). Origin = first point."""
    import bmesh
    me = bpy.data.meshes.new(name or 'tube')
    bm = bmesh.new()
    pts = [Vector(p) for p in points]
    origin = pts[0].copy()
    rings = []
    n = len(pts)
    up = Vector((0, 0, 1))
    for i, p in enumerate(pts):
        t = (pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]).normalized()
        side = t.cross(up)
        if side.length < 1e-4:
            side = t.cross(Vector((0, 1, 0)))
        side.normalize()
        nrm = side.cross(t).normalized()
        tb = tube * (1.0 - taper * (i / (n - 1))) + 1e-4
        ring = []
        for j in range(tseg):
            b = j / tseg * math.tau
            q = p - origin + side * (math.cos(b) * tb) + nrm * (math.sin(b) * tb)
            ring.append(bm.verts.new(q))
        rings.append(ring)
    for i in range(n - 1):
        for j in range(tseg):
            bm.faces.new((rings[i][j], rings[i][(j + 1) % tseg],
                          rings[i + 1][(j + 1) % tseg], rings[i + 1][j]))
    bm.faces.new(reversed(rings[0]))
    bm.faces.new(rings[-1])
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name or 'tube', me)
    _link(o)
    return o


def empty(name, at=(0, 0, 0)):
    e = bpy.data.objects.new(name, None)
    _link(e)
    e.location = at
    return e

# ---------------------------------------------------------------- ops helpers

def _ctx(objs):
    return dict(object=objs[0], active_object=objs[0],
                selected_objects=list(objs), selected_editable_objects=list(objs))


def join(objs, name=None):
    if len(objs) > 1:
        with bpy.context.temp_override(**_ctx(objs)):
            bpy.ops.object.join()
    o = objs[0]
    if name:
        o.name = name
    return o


def apply_xf(o, loc=True, rot=True, scale=True):
    with bpy.context.temp_override(**_ctx([o])):
        bpy.ops.object.transform_apply(location=loc, rotation=rot, scale=scale)
    return o


def _apply_mod(o, mod):
    with bpy.context.temp_override(**_ctx([o])):
        bpy.ops.object.modifier_apply(modifier=mod.name)


def remesh(o, voxel=0.05, smooth_iters=10, smooth_factor=0.55):
    m = o.modifiers.new('rm', 'REMESH')
    m.mode = 'VOXEL'
    m.voxel_size = voxel
    _apply_mod(o, m)
    if smooth_iters:
        s = o.modifiers.new('sm', 'SMOOTH')
        s.factor = smooth_factor
        s.iterations = smooth_iters
        _apply_mod(o, s)
    return o


def decimate(o, ratio):
    m = o.modifiers.new('dec', 'DECIMATE')
    m.ratio = ratio
    _apply_mod(o, m)
    return o


def smooth_shade(o, on=True):
    for p in o.data.polygons:
        p.use_smooth = on
    return o


def blob(parts, voxel=0.05, name=None, ratio=None, smooth_iters=10):
    """Join overlapping parts, voxel-remesh into one organic 'clay' mesh."""
    o = join(parts, name)
    apply_xf(o)
    remesh(o, voxel=voxel, smooth_iters=smooth_iters)
    if ratio:
        decimate(o, ratio)
    smooth_shade(o)
    return o


def jitter(o, amt=0.05, seed=1):
    rnd = random.Random(seed)
    for v in o.data.vertices:
        v.co += Vector((rnd.uniform(-amt, amt), rnd.uniform(-amt, amt), rnd.uniform(-amt, amt)))
    return o


def duplicate(o, name=None, linked=True):
    """Copy object; linked=True shares mesh data (exporter dedupes it)."""
    c = o.copy()
    if not linked and o.data:
        c.data = o.data.copy()
    if name:
        c.name = name
    _link(c)
    return c


def parent(children, parent_obj):
    for c in children:
        c.parent = parent_obj
    return parent_obj

# ---------------------------------------------------------------- color

def srgb(hexv, a=1.0):
    """0xRRGGBB -> linear rgba tuple (glTF/Blender want linear)."""
    def cv(c):
        c /= 255.0
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (cv((hexv >> 16) & 255), cv((hexv >> 8) & 255), cv(hexv & 255), a)


def mix(c1, c2, t, a=1.0):
    t = max(0.0, min(1.0, t))
    return (c1[0] + (c2[0] - c1[0]) * t,
            c1[1] + (c2[1] - c1[1]) * t,
            c1[2] + (c2[2] - c1[2]) * t, a)


def vpaint(o, fn):
    """Per-vertex color: fn(local_co: Vector) -> rgba tuple."""
    me = o.data
    ca = me.color_attributes.get('Col')
    if ca is None:
        ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    for i, v in enumerate(me.vertices):
        ca.data[i].color = fn(v.co)
    me.color_attributes.active_color = ca
    return o


def vnoise(co, scale=1.0, seed=0.0):
    """Cheap deterministic 3D value noise in [0,1] for paint variation."""
    x, y, z = co.x * scale + seed, co.y * scale + seed * 2.7, co.z * scale + seed * 5.1
    h = math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453
    return h - math.floor(h)

# ---------------------------------------------------------------- materials

def material(name, color=0xffffff, emit=None, strength=1.0, alpha=1.0,
             rough=0.9, double=False, vcol=False):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    c = srgb(color)
    b.inputs['Base Color'].default_value = (c[0], c[1], c[2], 1.0)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Specular IOR Level'].default_value = 0.2
    if vcol:
        n = m.node_tree.nodes.new('ShaderNodeVertexColor')
        n.layer_name = 'Col'
        m.node_tree.links.new(n.outputs['Color'], b.inputs['Base Color'])
    if emit is not None:
        e = srgb(emit)
        b.inputs['Emission Color'].default_value = (e[0], e[1], e[2], 1.0)
        b.inputs['Emission Strength'].default_value = strength
    else:
        b.inputs['Emission Strength'].default_value = 0.0
    if alpha < 1.0:
        b.inputs['Alpha'].default_value = alpha
        for attr, val in (('blend_method', 'BLEND'), ('surface_render_method', 'BLENDED')):
            try:
                setattr(m, attr, val)
            except Exception:
                pass
    m.use_backface_culling = not double
    return m


def set_mat(o, m):
    o.data.materials.clear()
    o.data.materials.append(m)
    return o

# ---------------------------------------------------------------- export

def _gltf_kwargs(**want):
    props = {p.identifier for p in bpy.ops.export_scene.gltf.get_rna_type().properties}
    return {k: v for k, v in want.items() if k in props}


def _descendants(objs):
    out = set()

    def rec(o):
        out.add(o)
        for c in o.children:
            rec(c)
    for o in objs:
        rec(o)
    return out


def export_glb(path, roots):
    todo = _descendants(roots)
    for o in bpy.context.scene.objects:
        o.select_set(o in todo)
    kwargs = _gltf_kwargs(
        filepath=path, export_format='GLB', use_selection=True,
        export_apply=True, export_yup=True,
        export_animations=False, export_skins=False, export_morph=False,
        export_cameras=False, export_lights=False,
        export_texcoords=False, export_normals=True,
        export_vertex_color='NAME',
        export_vertex_color_name='Col',
        export_all_vertex_colors=False,
        export_extras=False, export_image_format='NONE',
    )
    bpy.ops.export_scene.gltf(**kwargs)
    return path

# ---------------------------------------------------------------- preview

def preview(path, roots, azim=35.0, elev=22.0, zoom=1.0, samples=24):
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    sc.render.resolution_x = sc.render.resolution_y = 640
    sc.render.filepath = path

    w = bpy.data.worlds.new('PrevWorld')
    sc.world = w
    w.use_nodes = True
    bg = w.node_tree.nodes.get('Background')
    if bg:
        bg.inputs[0].default_value = (0.35, 0.45, 0.5, 1.0)
        bg.inputs[1].default_value = 0.8

    # bounds of all mesh descendants
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for o in _descendants(roots):
        if o.type != 'MESH':
            continue
        for corner in o.bound_box:
            p = o.matrix_world @ Vector(corner)
            lo = Vector(map(min, lo, p))
            hi = Vector(map(max, hi, p))
    center = (lo + hi) / 2
    size = max((hi - lo).length, 0.1)

    key = bpy.data.objects.new('Key', bpy.data.lights.new('Key', 'SUN'))
    _link(key)
    key.data.energy = 3.5
    key.rotation_euler = (math.radians(50), 0, math.radians(30))
    fill = bpy.data.objects.new('Fill', bpy.data.lights.new('Fill', 'AREA'))
    _link(fill)
    fill.data.energy = 250 * size
    fill.data.size = size * 2
    fill.location = center + Vector((-size, -size, size * 0.6))
    fill.rotation_euler = (math.radians(60), 0, math.radians(-135))

    cam = bpy.data.objects.new('Cam', bpy.data.cameras.new('Cam'))
    _link(cam)
    sc.camera = cam
    az, el = math.radians(azim), math.radians(elev)
    d = size * 1.35 / zoom
    cam.location = center + Vector((math.cos(el) * math.sin(az) * d,
                                    -math.cos(el) * math.cos(az) * d,
                                    math.sin(el) * d))
    direction = center - cam.location
    cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    bpy.ops.render.render(write_still=True)
    return path
