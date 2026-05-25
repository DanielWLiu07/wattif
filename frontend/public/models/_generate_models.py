#!/usr/bin/env python3
"""
Generate detailed glTF 2.0 binary (.glb) models for WattIf infrastructure,
rendered in the frontend via deck.gl ScenegraphLayer (`_lighting: "pbr"`).

Outputs (in this directory):
  - wind_turbine.glb   tapered tower + shaped nacelle + hub + 3 twisted blades
  - solar_array.glb    tilted panel grid (cells + mullions) on a legged frame
  - battery.glb        corrugated container + vent + doors/terminals + base pad
  - microgrid_hub.glb  building + gable roof + annex + cabinets + conduit

Conventions (drop-in compatible with the frontend):
  - glTF 2.0 binary, Y-up. Height runs along +Y.
  - X/Z centered on the origin, base resting at Y = 0.
  - Scaled in metres (wind turbine ~40 m to blade tip).
  - PBR materials (baseColorFactor + metallic/roughness) so parts read well
    under the scene's PBR lighting.

Run:  python3 _generate_models.py
Re-runnable / idempotent. Requires: trimesh, numpy.
"""

import os
import numpy as np
import trimesh
from trimesh import Trimesh
from trimesh.visual.material import PBRMaterial
from trimesh.transformations import (
    rotation_matrix,
    translation_matrix,
    concatenate_matrices,
)

HERE = os.path.dirname(os.path.abspath(__file__))


# ---------------------------------------------------------------------------
# material / color helpers
# ---------------------------------------------------------------------------
def _rgb01(hexstr):
    h = hexstr.lstrip("#")
    return [int(h[0:2], 16) / 255.0, int(h[2:4], 16) / 255.0, int(h[4:6], 16) / 255.0]


def pbr(hexstr, metallic=0.0, rough=0.75, alpha=1.0, name="mat"):
    """A uniform PBR material — exported as glTF baseColorFactor + factors."""
    r, g, b = _rgb01(hexstr)
    return PBRMaterial(
        name=name,
        baseColorFactor=[r, g, b, alpha],
        metallicFactor=float(metallic),
        roughnessFactor=float(rough),
    )


def finish(mesh, material):
    """Attach a uniform PBR material to a mesh (no UVs needed)."""
    mesh.visual = trimesh.visual.TextureVisuals(material=material)
    return mesh


# ---------------------------------------------------------------------------
# primitive helpers
# ---------------------------------------------------------------------------
def box(extents, material, translate=(0, 0, 0), transform=None):
    m = trimesh.creation.box(extents=extents)
    if transform is not None:
        m.apply_transform(transform)
    m.apply_translation(translate)
    return finish(m, material)


def cyl(radius, height, material, translate=(0, 0, 0), axis="y", sections=24):
    """Cylinder. trimesh builds it along Z; rotate so its length is along `axis`."""
    m = trimesh.creation.cylinder(radius=radius, height=height, sections=sections)
    if axis == "y":
        m.apply_transform(rotation_matrix(np.pi / 2, [1, 0, 0]))
    elif axis == "x":
        m.apply_transform(rotation_matrix(np.pi / 2, [0, 1, 0]))
    m.apply_translation(translate)
    return finish(m, material)


def frustum(r_bottom, r_top, height, material, translate=(0, 0, 0),
            transform=None, sections=24):
    """Truncated cone (tapered tube) standing along +Y, base at local y=0."""
    ang = np.linspace(0, 2 * np.pi, sections, endpoint=False)
    bottom = np.column_stack(
        [r_bottom * np.cos(ang), np.zeros(sections), r_bottom * np.sin(ang)]
    )
    top = np.column_stack(
        [r_top * np.cos(ang), np.full(sections, height), r_top * np.sin(ang)]
    )
    cap_b = [0.0, 0.0, 0.0]
    cap_t = [0.0, height, 0.0]
    verts = np.vstack([bottom, top, cap_b, cap_t])
    n = sections
    cb, ct = 2 * n, 2 * n + 1
    faces = []
    for i in range(n):
        j = (i + 1) % n
        faces.append([i, j, n + j])
        faces.append([i, n + j, n + i])
        faces.append([cb, j, i])          # bottom cap (downward)
        faces.append([ct, n + i, n + j])  # top cap (upward)
    m = Trimesh(vertices=verts, faces=np.array(faces), process=False)
    if transform is not None:
        m.apply_transform(transform)
    m.apply_translation(translate)
    return finish(m, material)


def _gable_roof(width, depth, height):
    """Triangular-prism roof, ridge along Z, base at local y=0."""
    w, d, h = width / 2, depth / 2, height
    verts = np.array(
        [
            [-w, 0, -d], [w, 0, -d], [w, 0, d], [-w, 0, d],  # base
            [0, h, -d], [0, h, d],                            # ridge
        ]
    )
    faces = np.array(
        [
            [0, 1, 4], [3, 5, 2],          # gable ends
            [0, 4, 5], [0, 5, 3],          # slope -x
            [1, 2, 5], [1, 5, 4],          # slope +x
            [0, 3, 2], [0, 2, 1],          # underside
        ]
    )
    return Trimesh(vertices=verts, faces=faces, process=False)


# ---------------------------------------------------------------------------
# wind turbine
# ---------------------------------------------------------------------------
# Airfoil-ish cross-section (chord along x in [-0.5, 0.5], thickness along z),
# a cambered teardrop so blades read as real airfoils, not flat slats.
_AIRFOIL = np.array(
    [
        [-0.50, 0.00],
        [-0.28, 0.42],
        [0.06, 0.40],
        [0.50, 0.04],
        [0.10, -0.20],
        [-0.26, -0.26],
    ]
)


def _blade_mesh(length, root_chord, tip_chord, root_thick, tip_thick,
                twist_deg=12.0, stations=9):
    """Loft a tapered + twisted airfoil blade. Span runs along +Y from y=0."""
    ncs = len(_AIRFOIL)
    rings = []
    for s in range(stations):
        t = s / (stations - 1)
        # ease the taper toward a slender tip
        chord = root_chord + (tip_chord - root_chord) * (t ** 0.8)
        thick = root_thick + (tip_thick - root_thick) * (t ** 0.8)
        twist = np.radians(twist_deg) * (1 - t)  # most twist near the root
        y = length * t
        cs = _AIRFOIL * np.array([chord, thick])
        ct_, st_ = np.cos(twist), np.sin(twist)
        xz = np.column_stack(
            [cs[:, 0] * ct_ - cs[:, 1] * st_, cs[:, 0] * st_ + cs[:, 1] * ct_]
        )
        ring = np.column_stack([xz[:, 0], np.full(ncs, y), xz[:, 1]])
        rings.append(ring)
    verts = np.vstack(rings)
    faces = []
    for s in range(stations - 1):
        a, b = s * ncs, (s + 1) * ncs
        for i in range(ncs):
            j = (i + 1) % ncs
            faces.append([a + i, a + j, b + j])
            faces.append([a + i, b + j, b + i])
    # caps
    root_c, tip_c = len(verts), len(verts) + 1
    verts = np.vstack([verts, rings[0].mean(axis=0), rings[-1].mean(axis=0)])
    base, top = 0, (stations - 1) * ncs
    for i in range(ncs):
        j = (i + 1) % ncs
        faces.append([root_c, base + j, base + i])
        faces.append([tip_c, top + i, top + j])
    return Trimesh(vertices=verts, faces=np.array(faces), process=False)


def make_wind_turbine():
    parts = []
    steel = pbr("#e9edf2", metallic=0.25, rough=0.55, name="tower_steel")
    housing = pbr("#cdd2d9", metallic=0.30, rough=0.5, name="nacelle")
    dark = pbr("#5b6068", metallic=0.4, rough=0.5, name="hub_metal")
    blade_mat = pbr("#f5f7fa", metallic=0.0, rough=0.4, name="blade")
    concrete = pbr("#b8bcc2", metallic=0.0, rough=0.95, name="foundation")

    # foundation pad
    parts.append((cyl(2.2, 0.6, concrete, translate=(0, 0.3, 0), sections=28),
                  "foundation"))
    # tapered tower
    tower_h = 24.0
    parts.append((frustum(1.5, 0.82, tower_h, steel, translate=(0, 0.6, 0),
                          sections=28), "tower"))
    top_y = 0.6 + tower_h

    # nacelle: main housing box, length along Z, plus a tapered tail and nose
    nac_y = top_y + 1.05
    parts.append((box([2.6, 2.0, 5.2], housing, translate=(0, nac_y, -0.4)),
                  "nacelle"))
    # rounded tail (rear, -Z)
    parts.append((frustum(1.0, 0.35, 1.4, housing,
                          transform=concatenate_matrices(
                              translation_matrix([0, nac_y, -3.0]),
                              rotation_matrix(np.pi / 2, [1, 0, 0]),
                          )), "nacelle_tail"))
    hub_z = 2.6
    # spinner nose cone (front, +Z)
    parts.append((frustum(0.95, 0.05, 1.3, dark,
                          transform=concatenate_matrices(
                              translation_matrix([0, nac_y, hub_z + 0.6]),
                              rotation_matrix(-np.pi / 2, [1, 0, 0]),
                          ), sections=18), "spinner"))
    # hub
    parts.append((cyl(0.85, 1.0, dark, translate=(0, nac_y, hub_z),
                     axis="z", sections=18), "hub"))

    # three twisted airfoil blades radiating in the rotor (X-Y) plane
    blade_len = 13.0
    base_blade = _blade_mesh(blade_len, root_chord=1.7, tip_chord=0.35,
                             root_thick=0.6, tip_thick=0.08, twist_deg=14.0)
    for k in range(3):
        m = base_blade.copy()
        T = concatenate_matrices(
            translation_matrix([0, nac_y, hub_z + 0.5]),
            rotation_matrix(k * 2 * np.pi / 3, [0, 0, 1]),
            translation_matrix([0, 0.8, 0]),  # start just outside the hub
        )
        m.apply_transform(T)
        parts.append((finish(m, blade_mat), f"blade_{k}"))
    return parts


# ---------------------------------------------------------------------------
# solar array
# ---------------------------------------------------------------------------
def make_solar_array():
    """A real PV panel grid (cells + mullions) on a tilted, legged frame."""
    parts = []
    frame_mat = pbr("#4a4f57", metallic=0.7, rough=0.45, name="frame")
    leg_mat = pbr("#3a3e45", metallic=0.6, rough=0.5, name="leg")
    cell_mat = pbr("#15366e", metallic=0.1, rough=0.25, name="pv_cell")
    glass_mat = pbr("#0c2247", metallic=0.0, rough=0.15, name="pv_glass")

    tilt = np.radians(28.0)
    panel_w, panel_h = 9.0, 4.6      # overall glazed area (X = width, Y = height)
    cols, rows = 8, 4
    border = 0.18
    gap = 0.07                        # mullion gap between cells

    # Build the panel flat in local XY (face normal +Y after we lay it down),
    # then tilt about X and lift onto legs.
    flat = []
    # backing / frame plate
    flat.append(box([panel_w + 2 * border, 0.16, panel_h + 2 * border],
                    frame_mat, translate=(0, -0.02, 0)))
    cell_w = (panel_w - (cols - 1) * gap) / cols
    cell_h = (panel_h - (rows - 1) * gap) / rows
    for r in range(rows):
        for c in range(cols):
            x = -panel_w / 2 + cell_w / 2 + c * (cell_w + gap)
            z = -panel_h / 2 + cell_h / 2 + r * (cell_h + gap)
            flat.append(box([cell_w, 0.08, cell_h], cell_mat,
                            translate=(x, 0.10, z)))
    # thin glass sheet over the cells (subtle sheen)
    flat.append(box([panel_w, 0.03, panel_h], glass_mat, translate=(0, 0.16, 0)))

    # tilt the whole panel about X and raise it
    pivot_y = 2.5
    tilt_T = concatenate_matrices(
        translation_matrix([0, pivot_y, 0]),
        rotation_matrix(tilt, [1, 0, 0]),
    )
    panel_meshes = []
    for m in flat:
        mm = m.copy()
        mm.apply_transform(tilt_T)
        panel_meshes.append(mm)

    # support legs (front lower, back higher) + a ground beam
    half_w = panel_w / 2 - 0.6
    front_z = (panel_h / 2) * np.cos(tilt)
    drop = (panel_h / 2) * np.sin(tilt)
    front_y = pivot_y - drop
    back_y = pivot_y + drop
    for sx in (-half_w, half_w):
        parts.append(box([0.3, front_y, 0.3], leg_mat,
                         translate=(sx, front_y / 2, front_z)))
        parts.append(box([0.3, back_y, 0.3], leg_mat,
                         translate=(sx, back_y / 2, -front_z)))
    # cross beams along ground
    parts.append(box([panel_w + 0.6, 0.25, 0.25], leg_mat,
                     translate=(0, 0.12, front_z)))
    parts.append(box([panel_w + 0.6, 0.25, 0.25], leg_mat,
                     translate=(0, 0.12, -front_z)))

    return [(m, "frame") for m in parts] + [(m, "panel") for m in panel_meshes]


# ---------------------------------------------------------------------------
# battery storage
# ---------------------------------------------------------------------------
def make_battery():
    """A corrugated container unit with a vent, doors/terminals and a base pad."""
    parts = []
    body = pbr("#2f6f4f", metallic=0.35, rough=0.55, name="container")
    rib = pbr("#286043", metallic=0.35, rough=0.5, name="rib")
    pad = pbr("#33373d", metallic=0.2, rough=0.9, name="pad")
    metal = pbr("#c3c7cd", metallic=0.85, rough=0.35, name="vent")
    door = pbr("#3c8a63", metallic=0.3, rough=0.5, name="door")
    accent = pbr("#d7a13a", metallic=0.6, rough=0.4, name="terminal")

    L, H, W = 8.0, 5.0, 3.0
    # base pad
    parts.append((box([L + 1.0, 0.5, W + 1.0], pad, translate=(0, 0.25, 0)), "pad"))
    y0 = 0.5
    # main body
    parts.append((box([L, H, W], body, translate=(0, y0 + H / 2, 0)), "body"))

    # vertical corrugation ribs along the two long (±Z) faces
    n_ribs = 11
    for i in range(n_ribs):
        x = -L / 2 + (i + 0.5) * (L / n_ribs)
        for zf in (W / 2, -W / 2):
            parts.append((box([0.18, H - 0.5, 0.12], rib,
                              translate=(x, y0 + H / 2, zf + np.sign(zf) * 0.05)),
                          "rib"))
    # roof cap + corner posts
    parts.append((box([L + 0.2, 0.25, W + 0.2], rib,
                      translate=(0, y0 + H + 0.1, 0)), "roof"))

    # double doors + terminals on the +X end
    xf = L / 2 + 0.05
    for dz in (-0.7, 0.7):
        parts.append((box([0.12, H - 1.0, 1.2], door,
                          translate=(xf, y0 + H / 2, dz)), "door"))
    # handles
    for dz in (-0.35, 0.35):
        parts.append((box([0.2, 0.9, 0.1], accent,
                          translate=(xf + 0.08, y0 + H / 2, dz)), "handle"))
    # louvered vent on the -X end
    for j in range(5):
        vy = y0 + 1.3 + j * 0.55
        parts.append((box([0.1, 0.35, 1.8], metal, translate=(-xf, vy, 0)), "vent"))
    # roof exhaust box
    parts.append((box([2.0, 0.6, 1.6], metal, translate=(L / 4, y0 + H + 0.4, 0)),
                  "exhaust"))
    return parts


# ---------------------------------------------------------------------------
# microgrid hub
# ---------------------------------------------------------------------------
def make_microgrid_hub():
    parts = []
    wall = pbr("#d9cbb2", metallic=0.0, rough=0.85, name="wall")
    wall2 = pbr("#c8b59a", metallic=0.0, rough=0.85, name="wall2")
    roof = pbr("#7a3b2e", metallic=0.0, rough=0.7, name="roof")
    trim = pbr("#9a8d74", metallic=0.0, rough=0.8, name="trim")
    glass = pbr("#2a3b52", metallic=0.1, rough=0.2, name="window")
    door_mat = pbr("#4a3528", metallic=0.1, rough=0.6, name="door")
    cab = pbr("#3b3f45", metallic=0.6, rough=0.5, name="cabinet")
    pipe = pbr("#8a8f96", metallic=0.8, rough=0.4, name="conduit")

    # main building
    bw, bh, bd = 10.0, 6.0, 8.0
    parts.append((box([bw, bh, bd], wall, translate=(0, bh / 2, 0)), "main_wall"))
    roof_mesh = _gable_roof(bw + 0.6, bd + 0.6, 2.8)
    roof_mesh.apply_translation([0, bh, 0])
    parts.append((finish(roof_mesh, roof), "main_roof"))
    # fascia trim board
    parts.append((box([bw + 0.7, 0.4, bd + 0.7], trim, translate=(0, bh - 0.1, 0)),
                  "fascia"))

    # windows + door on the +Z front face
    fz = bd / 2 + 0.03
    for wx in (-3.0, 3.0):
        parts.append((box([2.2, 2.0, 0.12], glass, translate=(wx, 3.4, fz)),
                      "window"))
    parts.append((box([1.6, 3.0, 0.15], door_mat, translate=(0, 1.5, fz)), "door"))

    # annex / smaller building
    parts.append((box([5.0, 4.0, 5.0], wall2, translate=(7.0, 2.0, 1.0)),
                  "annex_wall"))
    annex_roof = _gable_roof(5.4, 5.4, 1.6)
    annex_roof.apply_translation([7.0, 4.0, 1.0])
    parts.append((finish(annex_roof, roof), "annex_roof"))

    # equipment cabinets out front (-Z)
    for cx in (-6.0, -3.8, -1.6):
        parts.append((box([1.6, 2.4, 1.2], cab, translate=(cx, 1.2, 5.2)),
                      "cabinet"))
    # conduit pipes running from cabinets up the wall
    for cx in (-6.0, -3.8):
        parts.append((cyl(0.12, 3.0, pipe, translate=(cx, 1.5, 4.55),
                         axis="y", sections=10), "conduit"))
    parts.append((cyl(0.12, 4.4, pipe, translate=(-4.9, 2.95, 4.55),
                     axis="x", sections=10), "conduit_run"))
    return parts


# ---------------------------------------------------------------------------
BUILDERS = {
    "wind_turbine": make_wind_turbine,
    "solar_array": make_solar_array,
    "battery": make_battery,
    "microgrid_hub": make_microgrid_hub,
}

SIZE_LIMIT = 1_500_000


def export_scene(parts, name):
    """parts: list of (mesh, node_name). Each part is its own named node."""
    scene = trimesh.Scene()
    used = {}
    for mesh, node in parts:
        # keep node names unique but meaningful
        used[node] = used.get(node, 0) + 1
        gname = node if used[node] == 1 else f"{node}_{used[node]}"
        scene.add_geometry(mesh, geom_name=gname, node_name=gname)
    path = os.path.join(HERE, f"{name}.glb")
    scene.export(path)
    return path


def main():
    all_ok = True
    for name, builder in BUILDERS.items():
        parts = builder()
        path = export_scene(parts, name)
        size = os.path.getsize(path)
        loaded = trimesh.load(path)
        if isinstance(loaded, trimesh.Scene):
            nfaces = sum(int(len(g.faces)) for g in loaded.geometry.values())
            nnodes = len(loaded.geometry)
        else:
            nfaces = int(len(loaded.faces))
            nnodes = 1
        ok = nfaces > 0 and size < SIZE_LIMIT
        all_ok = all_ok and ok
        status = "OK" if ok else "CHECK"
        print(f"[{status}] {name:14s} {size/1024:7.1f} KB  faces={nfaces:5d}  "
              f"meshes={nnodes}")
    print("\nAll within limits." if all_ok else "\n!! Some models need attention.")


if __name__ == "__main__":
    main()
