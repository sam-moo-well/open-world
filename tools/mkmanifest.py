#!/usr/bin/env python3
"""Build assets/animations/manifest.json from measured clip data."""
import json, os

REPO = '/home/user/open-world'
clips = {c['file']: c for c in json.load(open(os.path.join(os.path.dirname(
    os.path.abspath(__file__)), 'clips.json')))}

# slug, category, loop?, notes  -- keyed by source filename
MAP = {
    # --- idles ---------------------------------------------------------
    'great sword idle.fbx':            ('idle',                'idle',  True,  'Primary combat idle, seamless loop'),
    'great sword idle (2).fbx':        ('idle_var_a',          'idle',  True,  'Idle variant, ~1deg seam'),
    'great sword idle (3).fbx':        ('idle_var_b',          'idle',  True,  'Idle variant, ~3deg seam'),
    'great sword idle (4).fbx':        ('idle_var_c',          'idle',  True,  'Idle variant, ~4deg seam - blend or trim tail'),
    'great sword idle (5).fbx':        ('idle_long',           'idle',  True,  'Long breather idle, seamless - good ambient/AFK'),
    # --- locomotion ----------------------------------------------------
    'great sword walk.fbx':            ('walk_fwd',            'locomotion', True, '+109 cm/s forward'),
    'great sword walk (2).fbx':        ('walk_back',           'locomotion', True, '-101 cm/s backward'),
    'great sword run (2).fbx':         ('run_fwd',             'locomotion', True, '+428 cm/s forward'),
    'great sword run.fbx':             ('run_back',            'locomotion', True, '-258 cm/s backward'),
    'great sword strafe.fbx':          ('strafe_walk_posx',    'locomotion', True, '+115 cm/s lateral (+X); confirm L/R visually'),
    'great sword strafe (2).fbx':      ('strafe_walk_negx',    'locomotion', True, '-125 cm/s lateral (-X)'),
    'great sword strafe (3).fbx':      ('strafe_run_posx',     'locomotion', True, '+235 cm/s lateral (+X)'),
    'great sword strafe (4).fbx':      ('strafe_run_negx',     'locomotion', True, '-309 cm/s lateral (-X)'),
    # --- turns ---------------------------------------------------------
    'great sword turn.fbx':            ('turn_a',              'turn',  False, 'In-place turn'),
    'great sword turn (2).fbx':        ('turn_b',              'turn',  False, 'In-place turn, ~90deg hip yaw'),
    'great sword 180 turn.fbx':        ('turn_180_a',          'turn',  False, '180deg about-face'),
    'great sword 180 turn (2).fbx':    ('turn_180_b',          'turn',  False, '180deg about-face, +24cm drift'),
    # --- crouch --------------------------------------------------------
    'great sword crouching.fbx':       ('crouch_enter',        'crouch', False, 'Stand -> crouch (hips -49 cm)'),
    'great sword crouching (2).fbx':   ('crouch_exit',         'crouch', False, 'Crouch -> stand (hips +50 cm); mirrors crouch_enter'),
    'great sword crouching (3).fbx':   ('crouch_idle',         'crouch', True,  'Crouched idle, seamless'),
    'great sword crouching (5).fbx':   ('crouch_idle_var',     'crouch', True,  'Crouched idle variant, seamless'),
    'great sword crouching (4).fbx':   ('crouch_move_a',       'crouch', False, '-22 cm/s; exact mirror of crouch_move_b'),
    'great sword crouching (6).fbx':   ('crouch_move_b',       'crouch', False, '+17 cm/s; exact mirror of crouch_move_a'),
    # --- jump ----------------------------------------------------------
    'great sword jump (2).fbx':        ('jump_standing',       'jump',  False, 'In-place vertical jump'),
    'great sword jump.fbx':            ('jump_running',        'jump',  False, '+269 cm/s leap - needs run entry'),
    # --- attacks -------------------------------------------------------
    'great sword attack.fbx':          ('attack_basic',        'attack', False, 'In-place; returns to start pose'),
    'great sword slash.fbx':           ('slash_1',             'attack', False, 'In-place; combo opener'),
    'great sword slash (3).fbx':       ('slash_2',             'attack', False, 'In-place'),
    'great sword slash (5).fbx':       ('slash_3',             'attack', False, 'In-place'),
    'great sword slash (4).fbx':       ('slash_lunge',         'attack', False, '+63 cm/s advance'),
    'great sword slash (2).fbx':       ('slash_combo',         'attack', False, '3.5 s, +88 cm/s - likely multi-hit combo, consider splitting'),
    'great sword high spin attack.fbx':('attack_spin',         'attack', False, '+125 cm/s spinning AoE'),
    'great sword jump attack.fbx':     ('attack_jump',         'attack', False, '+147 cm/s aerial'),
    'great sword slide attack.fbx':    ('attack_slide',        'attack', False, '+164 cm/s sliding'),
    'great sword kick.fbx':            ('kick_1',              'attack', False, 'In-place utility/stagger'),
    'great sword kick (2).fbx':        ('kick_2',              'attack', False, 'In-place utility/stagger'),
    # --- defence / reactions -------------------------------------------
    'great sword blocking (2).fbx':    ('block_hold',          'defend', True,  'Guard hold, seamless loop'),
    'great sword blocking.fbx':        ('block_enter',         'defend', False, 'Hips -23 cm; exact mirror of block_exit'),
    'great sword blocking (3).fbx':    ('block_exit',          'defend', False, 'Hips +23 cm; exact mirror of block_enter'),
    'great sword impact.fbx':          ('hit_react_1',         'react', False, 'In-place flinch'),
    'great sword impact (2).fbx':      ('hit_react_2',         'react', False, 'In-place flinch'),
    'great sword impact (3).fbx':      ('hit_react_3',         'react', False, 'In-place flinch'),
    'great sword impact (4).fbx':      ('hit_react_4',         'react', False, 'In-place flinch, short'),
    'great sword impact (5).fbx':      ('hit_react_5',         'react', False, 'In-place flinch'),
    'two handed sword death.fbx':      ('death_1',             'death', False, 'Falls back, hips -87 cm'),
    'two handed sword death (2).fbx':  ('death_2',             'death', False, 'Falls forward, hips -80 cm, +126 cm travel'),
    # --- equip / magic --------------------------------------------------
    'draw a great sword 1.fbx':        ('sword_draw',          'equip', False, 'Mirrors sword_sheathe'),
    'draw a great sword 2.fbx':        ('sword_sheathe',       'equip', False, 'Mirrors sword_draw'),
    'great sword casting.fbx':         ('cast_long',           'magic', False, '4.8 s channel, in-place'),
    'spell cast.fbx':                  ('cast_quick',          'magic', False, '1.1 s, in-place'),
    'great sword power up.fbx':        ('power_up',            'magic', False, '3.5 s buff/roar, in-place'),
}

out = {
    'source': 'Mixamo Great Sword Pack',
    'rig': {
        'file': 'assets/character/Maria WProp J J Ong.fbx',
        'skeleton': 'mixamorig (65 bones)',
        'meshes': {
            'Maria_J_J_Ong': {'verts': 8094, 'tris': 14566, 'skinned_bones': 52},
            'Maria_sword': {'verts': 42, 'tris': 80, 'skinned_bones': 1,
                            'bound_to': 'mixamorig:RightHand',
                            'note': 'rigid bind - acts as a hand socket, swappable'},
        },
        'material': 'MariaMat',
        'textures': ['maria_diffuse.png (6.2 MB)', 'maria_specular.png (4.6 MB)',
                     'maria_normal.png (3.8 MB)'],
    },
    'conventions': {
        'fbx_version': 7700,
        'fps': 30,
        'unit_scale_factor': 1.0,
        'units': 'centimetres',
        'up_axis': 'Y',
        'root_motion': 'baked into mixamorig:Hips translation - no dedicated root bone',
    },
    'clips': [],
}

for src, (slug, cat, loop, note) in MAP.items():
    c = clips[src]
    out['clips'].append({
        'name': slug,
        'category': cat,
        'file': f'assets/animations/{src}',
        'seconds': round(c['sec'], 3),
        'frames': round(c['sec'] * 30),
        'loop': loop,
        'root_motion': {'forward_cm_s': round(c['fwd_cms'], 1),
                        'lateral_cm_s': round(c['lat_cms'], 1)},
        'loop_seam_deg': round(c['loop_delta_deg'], 1),
        'notes': note,
    })

order = ['idle', 'locomotion', 'turn', 'crouch', 'jump', 'attack', 'defend',
         'react', 'death', 'equip', 'magic']
out['clips'].sort(key=lambda c: (order.index(c['category']), c['name']))

missing = set(clips) - set(MAP)
assert not missing, f'unmapped clips: {missing}'
assert len(out['clips']) == 51, len(out['clips'])

with open(os.path.join(REPO, 'assets/animations/manifest.json'), 'w') as f:
    json.dump(out, f, indent=2)
    f.write('\n')
print('wrote manifest with', len(out['clips']), 'clips')
