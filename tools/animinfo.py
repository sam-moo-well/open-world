#!/usr/bin/env python3
"""Per-clip animation analysis: duration, fps, skeleton hash, root motion, loopability."""
import struct, glob, os, sys, json, hashlib
from fbxinfo import parse, KTIME

TIMEMODE = {0: 'default', 1: 120, 2: 100, 3: 60, 4: 50, 5: 48, 6: 30, 7: 30,
            8: 29.97, 9: 29.97, 10: 25, 11: 24, 12: 1000, 13: 'custom', 14: 96,
            15: 72, 16: 59.94}


def decode(p):
    """array prop -> list"""
    if not (isinstance(p, tuple) and p and p[0] == 'array'):
        return []
    _, t, ln, raw = p
    fmt = {'f': 'f', 'd': 'd', 'l': 'q', 'i': 'i', 'b': 'b'}[t]
    return list(struct.unpack('<%d%s' % (ln, fmt), raw[:ln * struct.calcsize(fmt)]))


def analyze(path):
    ver, root = parse(path)
    objs = root.find('Objects')
    conns = root.find('Connections')
    gs = root.find('GlobalSettings')

    gprops = {}
    if gs and gs.find('Properties70'):
        for p in gs.find('Properties70').children:
            if p.props:
                gprops[p.props[0]] = p.props[-1]

    byid = {}
    bones = {}
    for c in (objs.children if objs else []):
        if not c.props:
            continue
        oid = c.props[0]
        nm = c.props[1] if len(c.props) > 1 else ''
        if isinstance(nm, str):
            nm = nm.split('\x00')[0]
        byid[oid] = (c.name, nm, c)
        if c.name == 'Model' and len(c.props) > 2 and c.props[2] == 'LimbNode':
            bones[oid] = nm

    # connections: (type, child, parent, [propname])
    child_of = {}
    edges = []
    for c in (conns.children if conns else []):
        if len(c.props) >= 3:
            edges.append((c.props[0], c.props[1], c.props[2],
                          c.props[3] if len(c.props) > 3 else None))
            if c.props[0] == 'OO':
                child_of.setdefault(c.props[2], []).append(c.props[1])

    # skeleton hierarchy signature
    parent = {}
    for t, ch, pa, _ in edges:
        if t == 'OO' and ch in bones:
            parent[ch] = bones.get(pa, 'ROOT')
    sig = sorted(f'{bones[b]}<{parent.get(b, "?")}' for b in bones)
    skel_hash = hashlib.md5('|'.join(sig).encode()).hexdigest()[:10]

    # animation stack timing
    dur = None
    stack_name = None
    for c in (objs.children if objs else []):
        if c.name == 'AnimationStack':
            stack_name = c.props[1].split('\x00')[0] if len(c.props) > 1 else ''
            p70 = c.find('Properties70')
            st = sp = None
            if p70:
                for p in p70.children:
                    if p.props and p.props[0] == 'LocalStart':
                        st = p.props[-1]
                    if p.props and p.props[0] == 'LocalStop':
                        sp = p.props[-1]
            if sp is not None:
                dur = (sp - (st or 0)) / KTIME

    # find Hips translation curves -> root motion
    hips_id = next((i for i, n in bones.items() if n.endswith('Hips')), None)
    root_motion = None
    nkeys = 0
    keytimes = None
    if hips_id is not None:
        # CurveNode -> Hips via OP with "Lcl Translation"
        tnode = None
        for t, ch, pa, pn in edges:
            if pa == hips_id and pn and 'Translation' in str(pn) and ch in byid \
                    and byid[ch][0] == 'AnimationCurveNode':
                tnode = ch
        if tnode is not None:
            axes = {}
            for t, ch, pa, pn in edges:
                if pa == tnode and ch in byid and byid[ch][0] == 'AnimationCurve':
                    node = byid[ch][2]
                    kv = node.find('KeyValueFloat')
                    kt = node.find('KeyTime')
                    vals = decode(kv.props[0]) if kv and kv.props else []
                    if pn:
                        axes[str(pn)[-1]] = vals
                    if kt and kt.props and keytimes is None:
                        keytimes = decode(kt.props[0])
            rm = {}
            for ax, vals in axes.items():
                if vals:
                    rm[ax] = {'min': round(min(vals), 2), 'max': round(max(vals), 2),
                              'start': round(vals[0], 2), 'end': round(vals[-1], 2),
                              'delta': round(vals[-1] - vals[0], 2),
                              'range': round(max(vals) - min(vals), 2),
                              'keys': len(vals)}
            root_motion = rm
            nkeys = max((len(v) for v in axes.values()), default=0)

    fps = TIMEMODE.get(gprops.get('TimeMode'), gprops.get('TimeMode'))
    frames = None
    if keytimes and len(keytimes) > 1:
        frames = len(keytimes)
    return {
        'file': os.path.basename(path),
        'ver': ver,
        'stack': stack_name,
        'sec': round(dur, 3) if dur else None,
        'fps': fps,
        'unit': gprops.get('UnitScaleFactor'),
        'up': gprops.get('UpAxis'),
        'bones': len(bones),
        'skel': skel_hash,
        'keyframes': frames or nkeys,
        'root_motion': root_motion,
        'has_mesh': any(c.name == 'Geometry' for c in (objs.children if objs else [])),
    }


if __name__ == '__main__':
    out = [analyze(p) for p in sorted(glob.glob(sys.argv[1] + '/*.fbx'))]
    print(json.dumps(out, indent=1, default=str))
