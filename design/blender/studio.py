"""Общая «студия» для рендеров Formula Bonus в Blender (bpy): материалы, примитивы с фасками, свет, камера, Cycles."""
import math
import bpy, bmesh
from mathutils import Vector


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    return bpy.context.scene


def principled(name, base, metallic=0.0, rough=0.3, coat=0.0, coat_rough=0.05, aniso=0.0, spec=0.5, emission=None, emit=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*base, 1)
    b.inputs['Metallic'].default_value = metallic
    b.inputs['Roughness'].default_value = rough
    b.inputs['Coat Weight'].default_value = coat
    b.inputs['Coat Roughness'].default_value = coat_rough
    b.inputs['Anisotropic'].default_value = aniso
    b.inputs['Specular IOR Level'].default_value = spec
    if emission:
        b.inputs['Emission Color'].default_value = (*emission, 1); b.inputs['Emission Strength'].default_value = emit
    return m


def materials():
    return dict(
        gold=principled('Gold', (1.0, 0.66, 0.09), metallic=1.0, rough=0.19),
        gold_satin=principled('GoldSatin', (1.0, 0.64, 0.08), metallic=1.0, rough=0.26, aniso=0.55),
        black=principled('BlackLacquer', (0.006, 0.006, 0.006), rough=0.13, coat=0.8, coat_rough=0.04),
    )


def link(obj):
    bpy.context.scene.collection.objects.link(obj); return obj


def smooth(ob):
    for p in ob.data.polygons: p.use_smooth = True
    return ob


def rounded_box(name, size, loc, mat, bevel=0.05, segs=5):
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0); bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    bm.to_mesh(me); bm.free()
    ob = link(bpy.data.objects.new(name, me)); ob.location = loc; ob.data.materials.append(mat)
    mod = ob.modifiers.new('Bevel', 'BEVEL'); mod.width = bevel; mod.segments = segs; mod.limit_method = 'NONE'; mod.harden_normals = True
    return smooth(ob)


def sphere(name, r, loc, mat, seg=96, rings=48):
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=r)
    bm.to_mesh(me); bm.free()
    ob = link(bpy.data.objects.new(name, me)); ob.location = loc; ob.data.materials.append(mat)
    return smooth(ob)


def area(name, loc, energy, size, color=(1, 1, 1), target=(0, 0, 1.1), size_y=None):
    ld = bpy.data.lights.new(name, 'AREA'); ld.energy = energy; ld.color = color
    ld.shape = 'RECTANGLE'; ld.size = size; ld.size_y = size_y or size
    ob = link(bpy.data.objects.new(name, ld)); ob.location = loc
    ob.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    return ob


def studio_lights(target=(0, 0, 1.1), k=1.0):
    """Ключевой, верхний, два контровых, заполняющий и два низких вертикальных софтбокса (дают отражения в боковых гранях)."""
    t = target
    area('Key', (-5.5, -5.0, 7.0), 2200 * k, 4.5, (1.0, 0.97, 0.92), target=t)
    area('Top', (0.5, 0.5, 9.0), 1400 * k, 6.0, (1.0, 0.98, 0.95), target=t)
    area('RimR', (6.0, 4.0, 4.0), 1600 * k, 2.2, (1.0, 0.86, 0.6), target=t, size_y=6)
    area('RimL', (-6.0, 4.5, 3.5), 900 * k, 2.0, (1.0, 0.9, 0.7), target=t, size_y=5)
    area('Fill', (6.5, -6.0, 1.8), 500 * k, 4.0, (1.0, 0.95, 0.88), target=t)
    area('SideL', (-6.5, -8.0, 0.6), 1600 * k, 2.4, (1.0, 0.95, 0.85), target=(t[0], t[1], 0.7), size_y=5)
    area('SideR', (7.5, 7.0, 0.6), 1200 * k, 2.4, (1.0, 0.9, 0.75), target=(t[0], t[1], 0.7), size_y=5)
    w = bpy.data.worlds.new('World'); bpy.context.scene.world = w; w.use_nodes = True
    w.node_tree.nodes['Background'].inputs['Color'].default_value = (0.035, 0.032, 0.028, 1)


def camera(target, az=36, el=24, dist=11.2, lens=70):
    cd = bpy.data.cameras.new('Cam'); cd.lens = lens
    cam = link(bpy.data.objects.new('Cam', cd)); bpy.context.scene.camera = cam
    tgt = Vector(target); a, e = math.radians(az), math.radians(el)
    cam.location = tgt + Vector((math.sin(a) * math.cos(e), -math.cos(a) * math.cos(e), math.sin(e))) * dist
    cam.rotation_euler = (tgt - cam.location).to_track_quat('-Z', 'Y').to_euler()
    return cam


def render(out, res=1000, samples=160):
    s = bpy.context.scene; r = s.render
    r.engine = 'CYCLES'; r.resolution_x = r.resolution_y = res; r.resolution_percentage = 100
    r.film_transparent = True; r.image_settings.file_format = 'PNG'; r.image_settings.color_mode = 'RGBA'
    s.cycles.device = 'CPU'; s.cycles.samples = samples; s.cycles.use_denoising = True; s.cycles.use_adaptive_sampling = True
    s.view_settings.view_transform = 'Standard'; s.view_settings.look = 'None'
    r.filepath = out; bpy.ops.render.render(write_still=True); print('saved', out)
