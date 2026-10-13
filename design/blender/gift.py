"""Премиальная 3D-подарочная коробка для карточки «Пригласи друга» (Formula Bonus).
Запуск: blender-venv/bin/python gift.py <out.png> [scheme=black|gold] [samples=160] [res=1000]
Модель строго ортогональная (без завалов), фаски на всех рёбрах, атласная лента с бантом, студийный свет, Cycles.
"""
import sys, math
import bpy, bmesh
from mathutils import Vector, Matrix

args = dict(a.split('=', 1) for a in sys.argv[2:] if '=' in a)
OUT = sys.argv[1]
SCHEME = args.get('scheme', 'black')
SAMPLES = int(args.get('samples', 160))
RES = int(args.get('res', 1000))
CAM_AZ = float(args.get('az', 36))       # азимут камеры от фронта вправо, градусы
CAM_EL = float(args.get('el', 24))       # высота камеры, градусы

# ---------- сцена ----------
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

# ---------- материалы ----------
def principled(name, base, metallic=0.0, rough=0.3, coat=0.0, coat_rough=0.05, aniso=0.0, spec=0.5):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*base, 1)
    b.inputs['Metallic'].default_value = metallic
    b.inputs['Roughness'].default_value = rough
    b.inputs['Coat Weight'].default_value = coat
    b.inputs['Coat Roughness'].default_value = coat_rough
    b.inputs['Anisotropic'].default_value = aniso
    b.inputs['Specular IOR Level'].default_value = spec
    return m

GOLD = principled('Gold', (1.0, 0.66, 0.09), metallic=1.0, rough=0.19)
GOLD_SATIN = principled('GoldSatin', (1.0, 0.64, 0.08), metallic=1.0, rough=0.26, aniso=0.55)
BLACK = principled('BlackLacquer', (0.006, 0.006, 0.006), rough=float(args.get('brough', 0.13)), coat=float(args.get('bcoat', 0.8)), coat_rough=0.04, spec=float(args.get('bspec', 0.5)))
BLACK_SATIN = principled('BlackSatin', (0.01, 0.01, 0.01), rough=0.24, coat=0.5, coat_rough=0.12, aniso=0.5)
BOX, RIB = (BLACK, GOLD_SATIN) if SCHEME == 'black' else (GOLD, BLACK_SATIN)

def link(obj):
    scene.collection.objects.link(obj); return obj

def rounded_box(name, size, loc, mat, bevel=0.05, segs=5):
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0); bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    bm.to_mesh(me); bm.free()
    ob = link(bpy.data.objects.new(name, me)); ob.location = loc; ob.data.materials.append(mat)
    mod = ob.modifiers.new('Bevel', 'BEVEL'); mod.width = bevel; mod.segments = segs; mod.limit_method = 'NONE'; mod.harden_normals = True
    for p in me.polygons: p.use_smooth = True
    return ob

def sweep(name, path, wdir, width_fn, thick, mat, cyclic=False, ws=4, end_notch=0.0, subsurf=2):
    """Лента: плоское сечение (ширина вдоль wdir, толщина по нормали) протягивается по плоскому пути."""
    me = bpy.data.meshes.new(name); bm = bmesh.new(); n = len(path); rings = []
    for i, p in enumerate(path):
        a = path[(i - 1) % n] if cyclic or i > 0 else path[i]
        b = path[(i + 1) % n] if cyclic or i < n - 1 else path[i]
        t = (b - a).normalized(); nrm = t.cross(wdir).normalized()
        s = i / (n if cyclic else n - 1); w = width_fn(s) / 2
        ring = []
        for side in (1, -1):
            cols = range(ws + 1) if side == 1 else range(ws, -1, -1)
            for k in cols:
                f = -1 + 2 * k / ws
                back = 0.0
                if end_notch and i == n - 1: back = end_notch * (1 - abs(f))       # V-образный срез на конце хвоста
                ring.append(bm.verts.new(p + wdir * (w * f) + nrm * (side * thick / 2) - t * back))
        rings.append(ring)
    m = len(rings[0])
    for i in range(n if cyclic else n - 1):
        r0, r1 = rings[i], rings[(i + 1) % n]
        for k in range(m): bm.faces.new((r0[k], r0[(k + 1) % m], r1[(k + 1) % m], r1[k]))
    if not cyclic:
        bm.faces.new(list(reversed(rings[0]))); bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    ob = link(bpy.data.objects.new(name, me)); ob.data.materials.append(mat)
    for p in me.polygons: p.use_smooth = True
    if subsurf: s = ob.modifiers.new('Subsurf', 'SUBSURF'); s.levels = s.render_levels = subsurf
    return ob

# ---------- коробка ----------
W, H = 2.0, 1.62                 # корпус
LW, LH, LZ = 2.14, 0.52, 1.40    # крышка: ширина, высота, низ
TOP = LZ + LH                    # верх крышки
RB, RT = 0.40, 0.028             # ширина и толщина ленты

PART = args.get('part', 'all')      # all | body | lid — слои для анимации открытия
BODY_OBJS, LID_OBJS = [], []
if PART == 'all':
    BODY_OBJS.append(rounded_box('Body', (W, W, H), (0, 0, H / 2), BOX, bevel=0.045))
else:
    # открытая коробка: стенки с толщиной, внутри тёплое свечение
    me = bpy.data.meshes.new('BodyOpen'); bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0); bmesh.ops.scale(bm, vec=Vector((W, W, H)), verts=bm.verts)
    top = [f for f in bm.faces if f.normal.z > 0.9]; bmesh.ops.delete(bm, geom=top, context='FACES')
    bmesh.ops.translate(bm, vec=Vector((0, 0, H / 2)), verts=bm.verts); bm.to_mesh(me); bm.free()
    ob = link(bpy.data.objects.new('BodyOpen', me)); ob.data.materials.append(BOX)
    so = ob.modifiers.new('Solid', 'SOLIDIFY'); so.thickness = 0.07; so.offset = -1
    bv = ob.modifiers.new('Bevel', 'BEVEL'); bv.width = 0.03; bv.segments = 5; bv.limit_method = 'ANGLE'; bv.harden_normals = True
    for p_ in me.polygons: p_.use_smooth = True
    BODY_OBJS.append(ob)
    glow = bpy.data.lights.new('InnerGlow', 'AREA'); glow.energy = float(args.get('glow', 260)); glow.size = 1.5; glow.color = (1.0, 0.78, 0.3)
    g_ob = link(bpy.data.objects.new('InnerGlow', glow)); g_ob.location = (0, 0, 0.25); g_ob.rotation_euler = (0, 0, 0)
LID_OBJS.append(rounded_box('Lid', (LW, LW, LH), (0, 0, LZ + LH / 2), BOX, bevel=0.06))
# вертикальные полосы ленты на корпусе (под крышкой) и на крышке (с переходом через верх)
if PART == 'all':
    BODY_OBJS += [rounded_box('BandBodyX', (W + 2 * RT, RB, LZ), (0, 0, LZ / 2), RIB, bevel=0.012, segs=3),
                  rounded_box('BandBodyY', (RB, W + 2 * RT, LZ), (0, 0, LZ / 2), RIB, bevel=0.012, segs=3)]
else:   # у открытой коробки лента — отдельные полосы на каждой стенке, до самого края
    for sx, sy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        size = (RT * 2, RB, H) if sx else (RB, RT * 2, H)
        BODY_OBJS.append(rounded_box('BandWall', size, (sx * W / 2, sy * W / 2, H / 2), RIB, bevel=0.012, segs=3))
LID_OBJS += [rounded_box('BandLidX', (LW + 2 * RT, RB, LH + RT), (0, 0, LZ + (LH + RT) / 2), RIB, bevel=0.014, segs=3),
             rounded_box('BandLidY', (RB, LW + 2 * RT, LH + RT - 0.002), (0, 0, LZ + (LH + RT - 0.002) / 2), RIB, bevel=0.014, segs=3)]

# ---------- бант ----------
KZ = TOP + RT + 0.11
def loop_path(L=float(args.get('ll', 1.06)), Hh=float(args.get('lh', 0.62)), tilt=float(args.get('lt', 22)), n=180):
    pts = []
    for i in range(n):
        th = 2 * math.pi * i / n
        x = L * (1 - math.cos(th)) / 2
        bulge = 1.0 if math.sin(th) > 0 else 0.5                    # верх петли выпуклее низа
        z = Hh * math.sin(th) * (0.55 + 0.45 * (1 - math.cos(th)) / 2) * bulge
        v = Vector((x, 0, z))
        v.rotate(Matrix.Rotation(math.radians(-tilt), 3, 'Y'))     # петля приподнята к верху
        pts.append(v)
    return pts

pinch = lambda s: RB * float(args.get('lw', 1.15)) * (0.4 + 0.6 * math.sin(math.pi * s) ** 0.7)   # у узла лента собрана
for side in (1, -1):
    pts = [Vector((side * p.x, p.y, p.z)) + Vector((0, 0, KZ - 0.02)) for p in loop_path()]
    ob = sweep(f'Loop{side}', pts, Vector((0, 1, 0)), pinch, 0.03, RIB, cyclic=True, ws=4); LID_OBJS.append(ob)
    ob.rotation_euler = (0, 0, math.radians(14 * side))     # петли слегка разведены, симметрично
    ob.location = (0, 0, 0)

# хвосты ленты: из-под узла вперёд, ложатся на крышку, V-срез
for side in (1, -1):
    ang = math.radians(-90 + side * 28)
    d = Vector((math.cos(ang), math.sin(ang), 0)); wdir = Vector((0, 0, 1)).cross(d).normalized()
    pts = []
    for i in range(60):
        s = i / 59; r = 0.06 + 0.95 * s
        z = KZ - 0.06 - (KZ - (TOP + RT + 0.018) - 0.06) * min(1, s / 0.35) ** 1.6 + 0.012 * math.sin(s * math.pi * 2.2) * (s > 0.35)
        pts.append(d * r + Vector((0, 0, z)))
    LID_OBJS.append(sweep(f'Tail{side}', pts, wdir, lambda s: RB * (0.82 + 0.1 * s), 0.026, RIB, ws=4, end_notch=0.12))

knot = rounded_box('Knot', (0.38, 0.5, 0.27), (0, 0, KZ), RIB, bevel=0.125, segs=10); LID_OBJS.append(knot)

# ---------- тень (shadow catcher) ----------
bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 0, 0))
ground = bpy.context.active_object; ground.is_shadow_catcher = True
ground.visible_glossy = False; ground.visible_diffuse = False; ground.visible_transmission = False   # пол не подсвечивает и не отражается в коробке
ground.data.materials.append(principled('Floor', (0.0, 0.0, 0.0), rough=1.0, spec=0.0))
if PART != 'all':
    ground.hide_render = True
    # невидимый для камеры слой всё равно отбрасывает тени — в закрытом виде слои совпадают идеально
    for o in (LID_OBJS if PART == 'body' else BODY_OBJS): o.visible_camera = False
    if PART == 'body':
        for o in LID_OBJS: o.visible_shadow = False   # открытая коробка без тени от крышки

# ---------- свет: студийные софтбоксы ----------
def area(name, loc, energy, size, color=(1, 1, 1), target=(0, 0, 1.1), size_y=None):
    ld = bpy.data.lights.new(name, 'AREA'); ld.energy = energy; ld.color = color
    ld.shape = 'RECTANGLE'; ld.size = size; ld.size_y = size_y or size
    ob = link(bpy.data.objects.new(name, ld)); ob.location = loc
    ob.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    return ob
area('Key', (-5.5, -5.0, 7.0), float(args.get('key', 2200)), float(args.get('ks', 4.5)), (1.0, 0.97, 0.92), size_y=float(args.get('ksy', 0)) or None)
area('Top', (0.5, 0.5, 9.0), float(args.get('top', 1400)), 6.0, (1.0, 0.98, 0.95))
area('RimR', (6.0, 4.0, 4.0), float(args.get('rim', 1600)), float(args.get('rs', 2.2)), (1.0, 0.86, 0.6), size_y=6)
area('RimL', (-6.0, 4.5, 3.5), float(args.get('rim', 1600)) * 0.56, float(args.get('rs', 2.0)), (1.0, 0.9, 0.7), size_y=5)
area('Fill', (6.5, -6.0, 1.8), 500, 4.0, (1.0, 0.95, 0.88))
# низкие вертикальные софтбоксы — именно они отражаются в боковых гранях (лента и лак), иначе бока «проваливаются» в чёрное
area('SideL', (-6.5, -8.0, 0.6), float(args.get('sl', 900)), 2.4, (1.0, 0.95, 0.85), target=(0, 0, 0.7), size_y=5)
area('SideR', (7.5, 7.0, 0.6), float(args.get('sr', 700)), 2.4, (1.0, 0.9, 0.75), target=(0, 0, 0.7), size_y=5)

world = bpy.data.worlds.new('World'); scene.world = world; world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.035, 0.032, 0.028, 1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value = 1.0

# ---------- камера: строго горизонтальный горизонт, без завалов ----------
cam_d = bpy.data.cameras.new('Cam'); cam_d.lens = 70
cam = link(bpy.data.objects.new('Cam', cam_d)); scene.camera = cam
tgt = Vector((0, 0, 1.15)); dist = 11.2
az, el = math.radians(CAM_AZ), math.radians(CAM_EL)
cam.location = tgt + Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el))) * dist
cam.rotation_euler = (tgt - cam.location).to_track_quat('-Z', 'Y').to_euler()

# ---------- рендер ----------
r = scene.render; r.engine = 'CYCLES'; r.resolution_x = r.resolution_y = RES; r.resolution_percentage = 100
r.film_transparent = True; r.image_settings.file_format = 'PNG'; r.image_settings.color_mode = 'RGBA'
scene.cycles.device = 'CPU'; scene.cycles.samples = SAMPLES; scene.cycles.use_denoising = True
scene.cycles.use_adaptive_sampling = True
try: scene.view_settings.view_transform = args.get('view', 'AgX'); scene.view_settings.look = args.get('look', 'AgX - Punchy')
except Exception as e: print('view:', e)
scene.view_settings.exposure = float(args.get('exp', 0.0))
r.filepath = OUT
bpy.ops.render.render(write_still=True)
print('saved', OUT)
