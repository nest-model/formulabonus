"""«Ты + друг»: золотая и чёрная фигурки и значок «+» — для карточки «Пригласи друга».
Запуск: python people.py <out.png> [samples=160] [res=1000] [az=14] [el=12]"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bpy, bmesh
from mathutils import Vector, Matrix
import studio as S

args = dict(a.split('=', 1) for a in sys.argv[2:] if '=' in a); OUT = sys.argv[1]
S.reset(); M = S.materials()
GOLD = S.principled('GoldSoft', (1.0, 0.68, 0.1), metallic=1.0, rough=float(args.get('gr', 0.27)))
BLACK = S.principled('BlackSoft', (0.005, 0.005, 0.005), rough=float(args.get('br', 0.24)), coat=float(args.get('bcoat', 0.6)), coat_rough=float(args.get('bcr', 0.14)), spec=float(args.get('bspec', 0.5)))


def shoulders(name, loc, scale, mat):
    """Плечи: верхняя половина сферы, сплюснутая по глубине, с аккуратно скруглённым нижним краем."""
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=128, v_segments=64, radius=1.0)
    geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
    res = bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(0, 0, 0), plane_no=(0, 0, 1), clear_inner=True)
    edges = [e for e in res['geom_cut'] if isinstance(e, bmesh.types.BMEdge)]
    bmesh.ops.holes_fill(bm, edges=edges, sides=0)
    bmesh.ops.scale(bm, vec=Vector((1.0, 0.8, 0.82)), verts=bm.verts)
    bm.to_mesh(me); bm.free()
    ob = S.link(bpy.data.objects.new(name, me)); ob.data.materials.append(mat)
    b = ob.modifiers.new('Bevel', 'BEVEL'); b.limit_method = 'ANGLE'; b.angle_limit = math.radians(40); b.width = 0.08; b.segments = 8; b.harden_normals = True
    S.smooth(ob); ob.location = loc; ob.scale = (scale,) * 3
    return ob


def person(prefix, loc, s, mat, turn=0.0):
    x, y, z = loc
    body = shoulders(prefix + 'Body', (x, y, z), s, mat); body.rotation_euler = (0, 0, turn)
    S.sphere(prefix + 'Head', 0.47 * s, (x, y, z + (0.82 + 0.11 + 0.47) * s), mat)


person('Friend', (-0.88, 0.62, 0.0), 0.9, BLACK, turn=math.radians(10))
person('You', (0.48, -0.32, 0.0), 1.0, GOLD, turn=math.radians(-8))

# значок «+»: чёрная шайба с золотым плюсом, смотрит строго в камеру
AZ, EL = float(args.get('az', 14)), float(args.get('el', 12))
TGT = (0.05, 0.1, 0.92)
cam = S.camera(TGT, az=AZ, el=EL, dist=float(args.get('dist', 10.5)), lens=70)
badge_loc = Vector((1.55, -0.1, 2.0))
look = (cam.location - badge_loc).normalized()
rot = look.to_track_quat('Z', 'Y').to_euler()
disc = bpy.data.objects.new('Disc', bpy.data.meshes.new('Disc')); S.link(disc)
bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=96, radius1=0.46, radius2=0.46, depth=0.16); bm.to_mesh(disc.data); bm.free()
disc.data.materials.append(BLACK); b = disc.modifiers.new('Bevel', 'BEVEL'); b.width = 0.05; b.segments = 6; b.limit_method = 'ANGLE'; b.harden_normals = True
S.smooth(disc); disc.location = badge_loc; disc.rotation_euler = rot
for w, h in ((0.5, 0.15), (0.15, 0.5)):
    p = S.rounded_box('Plus', (w, h, 0.1), (0, 0, 0), GOLD, bevel=0.045, segs=6)
    p.parent = disc; p.location = (0, 0, 0.11)

S.studio_lights(target=TGT)
S.render(OUT, res=int(args.get('res', 1000)), samples=int(args.get('samples', 160)))
