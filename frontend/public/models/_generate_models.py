#!/usr/bin/env python3
"""
Generate low-poly glTF 2.0 binary (.glb) models for WattIf infrastructure,
rendered in the frontend via deck.gl ScenegraphLayer.

Outputs (in this directory):
  - wind_turbine.glb   tower + nacelle + 3 blades
  - solar_array.glb    tilted dark-blue panels on a frame
  - battery.glb        container/box unit
  - microgrid_hub.glb  small building cluster with a roof

Conventions:
  - Y-up (glTF standard). Height runs along +Y.
  - Centered near origin. Scaled in metres (tens of metres).
  - Per-part colors baked as vertex colors (trimesh -> glTF PBR material).

Run:  python3 _generate_models.py
Re-runnable / idempotent. Requires: trimesh, numpy.
"""

import os
import numpy as np
import trimesh

HERE = os.path.dirname(os.path.abspath(__file__))


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------
def _rgba(hexstr, a=255):
    h = hexstr.lstrip("#")
    return [int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a]


def colored(mesh, hexstr):
    """Bake a flat color onto a mesh via face/vertex colors."""
    mesh.visual.face_colors = _rgba(hexstr)
    return mesh


def box(extents, translate=(0, 0, 0), color="#888888", transform=None):
    m = trimesh.creation.box(extents=extents)
    if transform is not None:
        m.apply_transform(transform)
    m.apply_translation(translate)
    return colored(m, color)


def cyl(radius, height, translate=(0, 0, 0), color="#888888", axis="y", sections=20):
    """Cylinder. trimesh builds it along Z; rotate so its length is along `axis`."""
    m = trimesh.creation.cylinder(radius=radius, height=height, sections=sections)
    if axis == "y":
        m.apply_transform(trimesh.transformations.rotation_matrix(np.pi / 2, [1, 0, 0]))
    elif axis == "x":
        m.apply_transform(trimesh.transformations.rotation_matrix(np.pi / 2, [0, 1, 0]))
    # axis == "z": leave as built
    m.apply_translation(translate)
    return colored(m, color)


def export_scene(meshes, name):
    scene = trimesh.Scene()
    for i, m in enumerate(meshes):
        scene.add_geometry(m, geom_name=f"{name}_part_{i}")
    path = os.path.join(HERE, f"{name}.glb")
    scene.export(path)
    return path


# ---------------------------------------------------------------------------
# models
# ---------------------------------------------------------------------------
def make_wind_turbine():
    parts = []
    tower_h = 26.0
    tower_r = 0.9
    # tapering-ish tower: a single cylinder is fine for low-poly
    parts.append(cyl(tower_r, tower_h, translate=(0, tower_h / 2, 0),
                     color="#e8eaed", sections=16))
    # nacelle (the housing box) at the top
    nacelle_y = tower_h + 0.8
    parts.append(box([4.0, 1.8, 1.8], translate=(0, nacelle_y, 0.6),
                     color="#cfd3d8"))
    # hub
    hub_z = 1.6
    parts.append(cyl(0.7, 0.8, translate=(0, nacelle_y, hub_z),
                     color="#b6bcc4", axis="z", sections=12))
    # 3 blades radiating from hub in the X-Y plane (rotor faces +Z)
    blade_len = 14.0
    blade = lambda angle: box(
        [0.5, blade_len, 0.15],
        transform=trimesh.transformations.concatenate_matrices(
            trimesh.transformations.translation_matrix([0, nacelle_y, hub_z]),
            trimesh.transformations.rotation_matrix(angle, [0, 0, 1]),
            trimesh.transformations.translation_matrix([0, blade_len / 2, 0]),
        ),
        color="#f4f6f8",
    )
    for k in range(3):
        parts.append(blade(k * 2 * np.pi / 3))
    return parts


def make_solar_array():
    parts = []
    tilt = np.radians(28)          # panel tilt toward the sun
    panel = [6.0, 0.15, 3.5]       # w, thickness, depth
    rows, cols = 1, 3
    gap = 6.6
    frame_color = "#5b6068"
    panel_color = "#15366e"        # dark blue PV
    for c in range(cols):
        x = (c - (cols - 1) / 2) * gap
        # support legs
        parts.append(box([0.25, 1.6, 0.25], translate=(x - 2.4, 0.8, 1.4), color=frame_color))
        parts.append(box([0.25, 2.8, 0.25], translate=(x - 2.4, 1.4, -1.4), color=frame_color))
        parts.append(box([0.25, 1.6, 0.25], translate=(x + 2.4, 0.8, 1.4), color=frame_color))
        parts.append(box([0.25, 2.8, 0.25], translate=(x + 2.4, 1.4, -1.4), color=frame_color))
        # tilted panel
        T = trimesh.transformations.concatenate_matrices(
            trimesh.transformations.translation_matrix([x, 2.2, 0]),
            trimesh.transformations.rotation_matrix(tilt, [1, 0, 0]),
        )
        parts.append(box(panel, transform=T, color=panel_color))
    return parts


def make_battery():
    parts = []
    # main container unit
    parts.append(box([8.0, 5.0, 3.0], translate=(0, 2.5, 0), color="#2f6f4f"))
    # base pad
    parts.append(box([9.0, 0.4, 4.0], translate=(0, 0.2, 0), color="#3b3f45"))
    # ribbed door panels (visual detail)
    for i in range(3):
        x = (i - 1) * 2.5
        parts.append(box([2.0, 4.2, 0.15], translate=(x, 2.6, 1.55), color="#3c8a63"))
    # roof vents
    parts.append(box([6.0, 0.4, 2.0], translate=(0, 5.2, 0), color="#bcbfc4"))
    return parts


def make_microgrid_hub():
    parts = []
    wall = "#d9cbb2"
    roof = "#7a3b2e"
    # main building
    parts.append(box([10.0, 6.0, 8.0], translate=(0, 3.0, 0), color=wall))
    # gable roof as a triangular prism
    roof_mesh = _gable_roof(width=10.6, depth=8.6, height=2.8)
    roof_mesh.apply_translation([0, 6.0, 0])
    parts.append(colored(roof_mesh, roof))
    # annex / smaller building
    parts.append(box([5.0, 4.0, 5.0], translate=(7.0, 2.0, 1.0), color="#c8b59a"))
    annex_roof = _gable_roof(width=5.4, depth=5.4, height=1.6)
    annex_roof.apply_translation([7.0, 4.0, 1.0])
    parts.append(colored(annex_roof, roof))
    # a couple of solar/equipment cabinets out front
    parts.append(box([1.5, 2.2, 1.2], translate=(-6.0, 1.1, 3.0), color="#3b3f45"))
    parts.append(box([1.5, 2.2, 1.2], translate=(-3.8, 1.1, 3.0), color="#3b3f45"))
    return parts


def _gable_roof(width, depth, height):
    """Triangular-prism roof, ridge along Z, base at y=0."""
    w, d, h = width / 2, depth / 2, height
    verts = np.array([
        [-w, 0, -d], [w, 0, -d], [w, 0, d], [-w, 0, d],  # base
        [0, h, -d], [0, h, d],                            # ridge
    ])
    faces = np.array([
        [0, 1, 4],          # gable end -d
        [3, 5, 2],          # gable end +d
        [0, 4, 5], [0, 5, 3],   # slope -x
        [1, 2, 5], [1, 5, 4],   # slope +x
        [0, 3, 2], [0, 2, 1],   # underside
    ])
    return trimesh.Trimesh(vertices=verts, faces=faces, process=False)


# ---------------------------------------------------------------------------
BUILDERS = {
    "wind_turbine": make_wind_turbine,
    "solar_array": make_solar_array,
    "battery": make_battery,
    "microgrid_hub": make_microgrid_hub,
}


def main():
    for name, builder in BUILDERS.items():
        parts = builder()
        path = export_scene(parts, name)
        size = os.path.getsize(path)
        # verify it loads back as non-empty geometry
        loaded = trimesh.load(path)
        if isinstance(loaded, trimesh.Scene):
            nfaces = sum(int(len(g.faces)) for g in loaded.geometry.values())
        else:
            nfaces = int(len(loaded.faces))
        status = "OK" if (nfaces > 0 and size < 500_000) else "CHECK"
        print(f"[{status}] {name}.glb  {size/1024:6.1f} KB  faces={nfaces}")


if __name__ == "__main__":
    main()
