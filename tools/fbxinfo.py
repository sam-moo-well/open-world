#!/usr/bin/env python3
"""Minimal Kaydara FBX binary reader -> asset report."""
import struct, zlib, sys, os, json, glob

KTIME = 46186158000  # FBX ktime units per second


class Node:
    __slots__ = ("name", "props", "children")

    def __init__(self, name, props, children):
        self.name, self.props, self.children = name, props, children

    def find(self, name):
        for c in self.children:
            if c.name == name:
                return c
        return None

    def findall(self, name):
        return [c for c in self.children if c.name == name]


def read_prop(buf, o):
    t = chr(buf[o]); o += 1
    if t == 'Y': v = struct.unpack_from('<h', buf, o)[0]; o += 2
    elif t == 'C': v = bool(buf[o]); o += 1
    elif t == 'I': v = struct.unpack_from('<i', buf, o)[0]; o += 4
    elif t == 'F': v = struct.unpack_from('<f', buf, o)[0]; o += 4
    elif t == 'D': v = struct.unpack_from('<d', buf, o)[0]; o += 8
    elif t == 'L': v = struct.unpack_from('<q', buf, o)[0]; o += 8
    elif t in 'SR':
        n = struct.unpack_from('<I', buf, o)[0]; o += 4
        v = buf[o:o + n]; o += n
        if t == 'S':
            v = v.decode('utf-8', 'replace')
    elif t in 'fdlib':
        ln, enc, clen = struct.unpack_from('<III', buf, o); o += 12
        raw = buf[o:o + clen]; o += clen
        if enc == 1:
            raw = zlib.decompress(raw)
        fmt = {'f': 'f', 'd': 'd', 'l': 'q', 'i': 'i', 'b': 'b'}[t]
        v = ('array', t, ln, raw)  # keep lazily; decode on demand
    else:
        raise ValueError(f'unknown prop type {t!r} at {o}')
    return v, o


def read_node(buf, o, ver):
    if ver >= 7500:
        end, nprops, plen = struct.unpack_from('<QQQ', buf, o); o += 24
        nlen = buf[o]; o += 1
        nullsz = 25
    else:
        end, nprops, plen = struct.unpack_from('<III', buf, o); o += 12
        nlen = buf[o]; o += 1
        nullsz = 13
    if end == 0:
        return None, o
    name = buf[o:o + nlen].decode('utf-8', 'replace'); o += nlen
    props = []
    for _ in range(nprops):
        v, o = read_prop(buf, o)
        props.append(v)
    children = []
    while o < end - nullsz + 1 and o < end:
        if o >= end:
            break
        # remaining bytes before end are children + null record
        if end - o <= nullsz:
            o = end
            break
        c, o = read_node(buf, o, ver)
        if c is None:
            break
        children.append(c)
    return Node(name, props, children), end


def parse(path):
    buf = open(path, 'rb').read()
    if not buf.startswith(b'Kaydara FBX Binary'):
        raise ValueError('not a binary FBX')
    ver = struct.unpack_from('<I', buf, 23)[0]
    o = 27
    roots = []
    while o < len(buf) - 20:
        n, o = read_node(buf, o, ver)
        if n is None:
            break
        roots.append(n)
    return ver, Node('<root>', [], roots)


def arrlen(p):
    return p[2] if isinstance(p, tuple) and p and p[0] == 'array' else 0


def report(path):
    ver, root = parse(path)
    r = {'file': os.path.basename(path), 'version': ver,
         'size_mb': round(os.path.getsize(path) / 1e6, 2)}

    gs = root.find('GlobalSettings')
    props = {}
    if gs:
        p70 = gs.find('Properties70')
        if p70:
            for p in p70.children:
                if p.props:
                    props[p.props[0]] = p.props[-1]
    r['unit_scale'] = props.get('UnitScaleFactor')
    r['up_axis'] = props.get('UpAxis')
    r['time_mode'] = props.get('TimeMode')

    objs = root.find('Objects')
    bones, meshes, nulls, other = [], [], [], []
    anim_stacks, anim_layers = [], []
    curves = curvenodes = clusters = skins = 0
    materials, textures, videos, poses = [], [], [], 0
    total_verts = total_polyidx = 0
    blendshapes = 0

    if objs:
        for c in objs.children:
            nm = c.props[1] if len(c.props) > 1 else ''
            if isinstance(nm, str):
                nm = nm.split('\x00')[0]
            sub = c.props[2] if len(c.props) > 2 else ''
            if c.name == 'Model':
                if sub == 'LimbNode':
                    bones.append(nm)
                elif sub == 'Mesh':
                    meshes.append(nm)
                elif sub == 'Null':
                    nulls.append(nm)
                else:
                    other.append(f'{nm}:{sub}')
            elif c.name == 'Geometry':
                v = c.find('Vertices')
                pi = c.find('PolygonVertexIndex')
                if v and v.props:
                    total_verts += arrlen(v.props[0]) // 3
                if pi and pi.props:
                    total_polyidx += arrlen(pi.props[0])
            elif c.name == 'AnimationStack':
                p70 = c.find('Properties70')
                stop = start = None
                if p70:
                    for p in p70.children:
                        if p.props and p.props[0] == 'LocalStop':
                            stop = p.props[-1]
                        if p.props and p.props[0] == 'LocalStart':
                            start = p.props[-1]
                anim_stacks.append((nm, start, stop))
            elif c.name == 'AnimationLayer':
                anim_layers.append(nm)
            elif c.name == 'AnimationCurve':
                curves += 1
            elif c.name == 'AnimationCurveNode':
                curvenodes += 1
            elif c.name == 'Deformer':
                if sub == 'Cluster':
                    clusters += 1
                elif sub == 'Skin':
                    skins += 1
                elif sub == 'BlendShape':
                    blendshapes += 1
            elif c.name == 'Material':
                materials.append(nm)
            elif c.name == 'Texture':
                textures.append(nm)
            elif c.name == 'Video':
                videos.append(nm)
            elif c.name == 'Pose':
                poses += 1

    r['bones'] = len(bones)
    r['bone_names'] = bones
    r['meshes'] = meshes
    r['nulls'] = nulls
    r['other_models'] = other
    r['verts'] = total_verts
    r['tris'] = total_polyidx // 3 if total_polyidx else 0
    r['skins'] = skins
    r['clusters'] = clusters
    r['blendshapes'] = blendshapes
    r['materials'] = materials
    r['textures'] = textures
    r['embedded_media'] = len(videos)
    r['poses'] = poses
    r['curves'] = curves
    r['curvenodes'] = curvenodes
    r['stacks'] = []
    for nm, st, sp in anim_stacks:
        dur = (sp - st) / KTIME if (st is not None and sp is not None) else None
        r['stacks'].append({'name': nm, 'seconds': round(dur, 3) if dur else None})
    r['layers'] = anim_layers
    return r


if __name__ == '__main__':
    out = []
    for p in sorted(glob.glob(sys.argv[1] + '/*.fbx')):
        try:
            out.append(report(p))
        except Exception as e:
            out.append({'file': os.path.basename(p), 'error': f'{type(e).__name__}: {e}'})
    print(json.dumps(out, indent=1, default=str))
