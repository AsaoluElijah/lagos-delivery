import bpy
import math
from mathutils import Vector


COLLECTION_NAME = "Jet Interior"


def remove_collection(name):
    col = bpy.data.collections.get(name)
    if not col:
        return
    for obj in list(col.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.collections.remove(col)


def make_material(name, color, roughness=0.45, metallic=0.0, emission=None, emission_strength=0.0):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.diffuse_color = (*color[:3], color[3] if len(color) > 3 else 1.0)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = mat.diffuse_color
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if emission is not None:
        if "Emission Color" in bsdf.inputs:
            bsdf.inputs["Emission Color"].default_value = (*emission, 1.0)
            bsdf.inputs["Emission Strength"].default_value = emission_strength
        elif "Emission" in bsdf.inputs:
            bsdf.inputs["Emission"].default_value = (*emission, 1.0)
            bsdf.inputs["Emission Strength"].default_value = emission_strength
    return mat


def link_object(obj):
    for col in list(obj.users_collection):
        col.objects.unlink(obj)
    jet.objects.link(obj)


def cube(name, loc, scale, mat, bevel=0.08, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(location=loc, rotation=rotation)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    link_object(obj)
    if bevel:
        mod = obj.modifiers.new("Soft edges", "BEVEL")
        mod.width = bevel
        mod.segments = 3
    obj.data.materials.append(mat)
    return obj


def cylinder(name, loc, radius, depth, mat, rotation=(0, 0, 0), vertices=48):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc, rotation=rotation)
    obj = bpy.context.active_object
    obj.name = name
    link_object(obj)
    obj.data.materials.append(mat)
    bevel = obj.modifiers.new("Soft edges", "BEVEL")
    bevel.width = 0.04
    bevel.segments = 2
    return obj


def torus(name, loc, major_radius, minor_radius, mat, rotation=(0, 0, 0), scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major_radius,
        minor_radius=minor_radius,
        major_segments=48,
        minor_segments=12,
        location=loc,
        rotation=rotation,
    )
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    link_object(obj)
    obj.data.materials.append(mat)
    return obj


def arch_panel(name, y0, y1, x0, x1, z_func, mat, thickness=0.055):
    verts = []
    for y in (y0, y1):
        verts.extend([(x0, y, z_func(x0)), (x1, y, z_func(x1))])
    faces = [(0, 1, 3, 2)]
    mesh = bpy.data.meshes.new(name + " Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    jet.objects.link(obj)
    obj.data.materials.append(mat)
    solid = obj.modifiers.new("Shell thickness", "SOLIDIFY")
    solid.thickness = thickness
    bevel = obj.modifiers.new("Panel softness", "BEVEL")
    bevel.width = 0.035
    bevel.segments = 2
    return obj


def create_window(side, y, index):
    x = side * 2.36
    rot = (0, math.radians(90), 0)
    torus(f"Window Frame {side} {index}", (x, y, 1.92), 0.49, 0.065, wood, rot, (1.42, 1.0, 1.0))
    pane = cylinder(f"Window Glow {side} {index}", (x - side * 0.055, y, 1.92), 0.46, 0.035, window_glow, rot)
    pane.scale.x = 1.42


def create_chair(name, x, y, facing=1):
    # Seat and sculpted back in warm ivory leather.
    cube(name + " Seat", (x, y, 0.83), (0.58, 0.62, 0.16), leather, 0.15)
    cube(name + " Back", (x, y + facing * 0.48, 1.48), (0.60, 0.17, 0.68), leather, 0.18,
         (math.radians(-8 * facing), 0, 0))
    cube(name + " Headrest", (x, y + facing * 0.57, 2.02), (0.48, 0.16, 0.24), leather, 0.14,
         (math.radians(-8 * facing), 0, 0))
    cube(name + " Arm L", (x - 0.64, y, 1.06), (0.12, 0.60, 0.20), leather, 0.11)
    cube(name + " Arm R", (x + 0.64, y, 1.06), (0.12, 0.60, 0.20), leather, 0.11)
    cylinder(name + " Pedestal", (x, y, 0.39), 0.28, 0.55, metal, vertices=32)


def create_pillow(name, loc, color_mat, accent=False):
    pillow = cube(name, loc, (0.43, 0.12, 0.43), color_mat, 0.18)
    pillow.scale.x = 1.08
    if accent:
        cube(name + " Band", (loc[0], loc[1] - 0.125, loc[2]), (0.12, 0.025, 0.44), leather, 0.025)


remove_collection(COLLECTION_NAME)
jet = bpy.data.collections.new(COLLECTION_NAME)
bpy.context.scene.collection.children.link(jet)

# Preserve the user's prior scene while keeping it out of this render.
for obj in bpy.context.scene.objects:
    if obj.name in {"Cube", "Camera", "Light"}:
        obj.hide_render = True

ivory = make_material("Cabin Ivory", (0.88, 0.855, 0.79, 1), 0.32)
shell_white = make_material("Warm White Shell", (0.96, 0.945, 0.91, 1), 0.28,
                            emission=(0.96, 0.90, 0.80), emission_strength=0.45)
leather = make_material("Cream Leather", (0.78, 0.755, 0.69, 1), 0.36)
wood = make_material("Dark Walnut", (0.16, 0.055, 0.025, 1), 0.3)
wood_light = make_material("Walnut Cabinet", (0.29, 0.13, 0.07, 1), 0.34)
carpet = make_material("Light Taupe Carpet", (0.49, 0.47, 0.42, 1), 0.92)
black = make_material("Screen Black", (0.008, 0.01, 0.012, 1), 0.16)
metal = make_material("Brushed Nickel", (0.22, 0.23, 0.24, 1), 0.26, 0.75)
charcoal = make_material("Charcoal Textile", (0.035, 0.035, 0.04, 1), 0.7)
magenta = make_material("Fresh Magenta Flowers", (0.72, 0.005, 0.12, 1), 0.42)
window_glow = make_material("Window Daylight", (0.82, 0.93, 1.0, 1), 0.15, emission=(0.7, 0.88, 1.0), emission_strength=3.5)
light_mat = make_material("Warm Light Strip", (1.0, 0.82, 0.58, 1), 0.2, emission=(1.0, 0.63, 0.32), emission_strength=7.0)

# Floor and arched fuselage liner.
cube("Carpeted Cabin Floor", (0, 0, 0.08), (2.38, 6.1, 0.08), carpet, 0.03)
cube("Left Lower Wall", (-2.39, 0, 1.12), (0.10, 6.1, 1.05), shell_white, 0.12)
cube("Right Lower Wall", (2.39, 0, 1.12), (0.10, 6.1, 1.05), shell_white, 0.12)
cube("Left Upper Wall", (-2.40, 0, 2.42), (0.09, 6.1, 0.52), shell_white, 0.10)
cube("Right Upper Wall", (2.40, 0, 2.42), (0.09, 6.1, 0.52), shell_white, 0.10)

def ceiling_z(x):
    return 3.12 + 0.34 * math.cos((abs(x) / 2.4) * math.pi / 2)

segments = 10
xs = [-2.4 + 4.8 * i / segments for i in range(segments + 1)]
for i in range(segments):
    arch_panel(f"Ceiling Panel {i+1:02d}", -6.08, 6.08, xs[i], xs[i+1], ceiling_z, shell_white)

# Long walnut valances and warm indirect lighting.
for side in (-1, 1):
    cube(f"Walnut Valance {side}", (side * 2.14, 0, 2.62), (0.22, 6.03, 0.11), wood, 0.04)
    cube(f"Indirect Light {side}", (side * 1.92, 0, 2.49), (0.045, 5.92, 0.035), light_mat, 0.025)
    cube(f"Ceiling Inlay {side}", (side * 1.43, 0, 3.23), (0.035, 5.95, 0.035), wood, 0.02,
         (0, math.radians(side * 17), 0))

# Oval windows along both sides.
for side in (-1, 1):
    for idx, y in enumerate((-4.35, -1.85, 0.75, 3.25), 1):
        create_window(side, y, idx)

# Forward walnut bulkhead, doorway and small display.
cube("Forward Bulkhead", (0, 5.82, 1.68), (2.38, 0.16, 1.62), wood, 0.08)
cube("Forward Door", (0, 5.60, 1.42), (0.64, 0.07, 1.28), wood_light, 0.10)
cube("Forward Display", (0.99, 5.58, 2.24), (0.43, 0.045, 0.27), black, 0.035)
cube("Display Lower Glow", (0.99, 5.52, 2.06), (0.28, 0.02, 0.018), window_glow, 0.01)

# Left three-seat divan.
for i, y in enumerate((-4.45, -3.42, -2.39)):
    cube(f"Sofa Seat {i+1}", (-1.58, y, 0.66), (0.76, 0.49, 0.17), leather, 0.13)
    cube(f"Sofa Back {i+1}", (-2.05, y, 1.20), (0.19, 0.49, 0.54), leather, 0.16, (0, math.radians(-8), 0))
cube("Sofa Front Arm", (-1.57, -5.02, 0.95), (0.79, 0.13, 0.36), leather, 0.16)
cube("Sofa Rear Arm", (-1.57, -1.84, 0.95), (0.79, 0.13, 0.36), leather, 0.16)
create_pillow("Charcoal Pillow", (-1.94, -4.28, 1.33), charcoal)
create_pillow("Monogram Pillow", (-1.94, -2.88, 1.34), charcoal, True)

# Four club seats around the aisle.
create_chair("Left Aft Club", -1.42, 0.55, 1)
create_chair("Right Aft Club", 1.42, 0.55, 1)
create_chair("Left Forward Club", -1.42, 3.25, -1)
create_chair("Right Forward Club", 1.42, 3.25, -1)

# Right-side credenza, stone top, and inset screen.
cube("Credenza Body", (1.72, -3.62, 0.62), (0.67, 1.68, 0.54), wood_light, 0.07)
stone = make_material("Stone Counter", (0.45, 0.44, 0.39, 1), 0.5)
cube("Credenza Stone Top", (1.72, -3.62, 1.19), (0.70, 1.70, 0.045), stone, 0.025)
cube("Credenza Screen", (2.08, -3.12, 1.72), (0.055, 0.82, 0.48), black, 0.045,
     (0, math.radians(-11), 0))
screen_reflection = make_material("Screen Reflection Material", (0.08, 0.10, 0.11, 1), 0.12)
cube("Screen Reflection", (2.01, -3.12, 1.75), (0.010, 0.64, 0.018), screen_reflection, 0.008,
     (0, math.radians(-11), 0))

# A small stack of books and flower arrangement on the credenza.
for i, (z, color) in enumerate(((1.27, ivory), (1.34, charcoal), (1.41, leather))):
    cube(f"Book {i+1}", (1.53, -2.26, z), (0.34, 0.25, 0.035), color, 0.015, (0, 0, math.radians(4 - i * 3)))
cylinder("Flower Vase", (1.98, -4.82, 1.47), 0.20, 0.52, black, vertices=32)
for i in range(13):
    angle = i * 2.399
    radius = 0.13 + 0.22 * ((i % 4) / 3)
    x = 1.98 + math.cos(angle) * radius
    y = -4.82 + math.sin(angle) * radius
    z = 1.82 + 0.10 * math.sin(i * 1.7)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=0.16, location=(x, y, z))
    flower = bpy.context.active_object
    flower.name = f"Flower {i+1:02d}"
    link_object(flower)
    flower.data.materials.append(magenta)

# Camera matching the reference's wide, centered rear-cabin view.
bpy.ops.object.camera_add(location=(0.0, -7.45, 2.18))
camera = bpy.context.active_object
camera.name = "Jet Interior Camera"
link_object(camera)
camera.data.lens = 27
camera.data.sensor_width = 36
target = Vector((0.0, 2.0, 1.55))
camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
bpy.context.scene.camera = camera

# Soft area lights supplement the emissive strips.
for name, loc, energy, size in (
    ("Cabin Key", (0, -1.5, 3.02), 520, 5.0),
    ("Cabin Fill", (0, 3.4, 2.95), 390, 4.0),
):
    bpy.ops.object.light_add(type='AREA', location=loc)
    lamp = bpy.context.active_object
    lamp.name = name
    link_object(lamp)
    lamp.data.energy = energy
    lamp.data.shape = 'RECTANGLE'
    lamp.data.size = size
    lamp.data.size_y = 1.8
    lamp.rotation_euler = (0, 0, 0)

scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE'
scene.render.resolution_x = 768
scene.render.resolution_y = 512
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.film_transparent = False
scene.world.color = (0.025, 0.025, 0.025)
scene.view_settings.look = 'AgX - Medium High Contrast'

for obj in bpy.context.selected_objects:
    obj.select_set(False)
camera.select_set(True)
bpy.context.view_layer.objects.active = camera

result = {
    "collection": COLLECTION_NAME,
    "objects_created": len(jet.objects),
    "camera": camera.name,
    "render_engine": scene.render.engine,
    "resolution": [scene.render.resolution_x, scene.render.resolution_y],
}
