#!/usr/bin/env python3
import json
import os
import sys
import re
from datetime import datetime

HAS_HID = False
try:
    import hid
    HAS_HID = True
except ImportError:
    pass

BASIC_KEYCODES = {
    0: "KC_NO",
    1: "KC_TRNS",
}
for idx, char in enumerate("ABCDEFGHIJKLMNOPQRSTUVWXYZ", start=4):
    BASIC_KEYCODES[idx] = f"KC_{char}"
for idx, char in enumerate("1234567890", start=30):
    BASIC_KEYCODES[idx] = f"KC_{char}"
for idx in range(1, 13):
    BASIC_KEYCODES[57 + idx] = f"KC_F{idx}"
BASIC_KEYCODES.update({
    40: "KC_ENTER", 41: "KC_ESCAPE", 42: "KC_BSPACE", 43: "KC_TAB", 44: "KC_SPACE",
    45: "KC_MINUS", 46: "KC_EQUAL", 47: "KC_LBRACKET", 48: "KC_RBRACKET", 49: "KC_BSLASH",
    50: "KC_NONUS_HASH", 51: "KC_SEMICOLON", 52: "KC_QUOTE", 53: "KC_GRAVE", 54: "KC_COMMA",
    55: "KC_DOT", 56: "KC_SLASH", 57: "KC_CAPSLOCK", 74: "KC_HOME", 77: "KC_END",
    79: "KC_RIGHT", 80: "KC_LEFT", 81: "KC_DOWN", 82: "KC_UP",
    84: "KC_KP_SLASH", 85: "KC_KP_ASTERISK", 86: "KC_KP_MINUS", 87: "KC_KP_PLUS",
    88: "KC_KP_ENTER", 89: "KC_KP_1", 90: "KC_KP_2", 91: "KC_KP_3", 92: "KC_KP_4",
    93: "KC_KP_5", 94: "KC_KP_6", 95: "KC_KP_7", 96: "KC_KP_8", 97: "KC_KP_9",
    98: "KC_KP_0", 99: "KC_KP_DOT", 103: "KC_KP_EQUAL", 133: "KC_KP_COMMA",
    224: "KC_LCTRL", 225: "KC_LSHIFT", 226: "KC_LALT", 227: "KC_LGUI",
    228: "KC_RCTRL", 229: "KC_RSHIFT", 230: "KC_RALT", 231: "KC_RGUI",
    144: "KC_LANG1", 145: "KC_LANG2", 0xA8: "KC_MUTE", 0xA9: "KC_VOLU", 0xAA: "KC_VOLD",
    0xd1: "KC_BTN1", 0xd2: "KC_BTN2", 0xd3: "KC_BTN3", 217: "KC_WH_U", 218: "KC_WH_D",
    189: "KC_BRIU", 190: "KC_BRID"
})

def integer_to_keycode_string(kc):
    if kc == 0: return "KC_NO"
    if kc == 1: return "KC_TRNS"
    if 0x5700 <= kc <= 0x57FF: return f"TD({kc & 0xFF})"
    if 0x7700 <= kc <= 0x77FF: return f"M{kc & 0xFF}"
    if 0x4000 <= kc <= 0x4FFF:
        return f"LT{(kc >> 8) & 0x0F}({BASIC_KEYCODES.get(kc & 0xFF, f'KC_{kc & 0xFF}')})"
    if 0x7E00 <= kc <= 0x7FFF: return f"USER{kc & 0xFF:02d}"
    if 0x5200 <= kc <= 0x521F: return f"TO({kc & 0x1F})"
    if 0x5220 <= kc <= 0x523F: return f"MO({kc & 0x1F})"
    if 0x5240 <= kc <= 0x525F: return f"TG({kc & 0x1F})"
    if 0x5260 <= kc <= 0x527F: return f"DF({kc & 0x1F})"
    if 0x5280 <= kc <= 0x529F: return f"TT({kc & 0x1F})"
    if 0x52A0 <= kc <= 0x52BF: return f"OSL({kc & 0x1F})"
    mods = (kc >> 8) & 0x1F
    if mods != 0 and (kc & 0xE000) == 0:
        inner = kc & 0xFF
        inner_str = BASIC_KEYCODES.get(inner, f"KC_{inner}")
        mod_names = {0x01: "LCTL", 0x02: "LSFT", 0x04: "LALT", 0x08: "LGUI", 0x11: "RCTL", 0x12: "RSFT", 0x14: "RALT", 0x18: "RGUI"}
        mod_str = mod_names.get(mods)
        if mod_str: return f"{mod_str}({inner_str})"
    return BASIC_KEYCODES.get(kc, f"KC_{kc}")

def decode_macro_bytes(macro_bytes):
    actions = []
    i = 0
    text_accum = []
    def flush_text():
        if text_accum:
            actions.append(["text", "".join(text_accum)])
            text_accum.clear()
    while i < len(macro_bytes):
        b = macro_bytes[i]
        if b == 0: break
        if b == 1:
            flush_text()
            if i + 1 < len(macro_bytes):
                op = macro_bytes[i+1]
                if op in [1, 2, 3]:
                    kc_val = macro_bytes[i+2]
                    kc_str = BASIC_KEYCODES.get(kc_val, f"KC_{kc_val}")
                    act_name = {1: "tap", 2: "down", 3: "up"}[op]
                    actions.append([act_name, kc_str])
                    i += 3
                    continue
                elif op == 4:
                    digits = []
                    i += 2
                    while i < len(macro_bytes) and chr(macro_bytes[i]).isdigit():
                        digits.append(chr(macro_bytes[i]))
                        i += 1
                    ms = int("".join(digits)) if digits else 0
                    actions.append(["delay", ms])
                    continue
            i += 1
        else:
            text_accum.append(chr(b))
            i += 1
    flush_text()
    return actions

def read_layout_from_keyboard():
    if not HAS_HID:
        raise Exception("The 'hidapi' package is not installed. Please run 'pip install hidapi' to enable reading from the keyboard.")
    
    # Locate Cornix raw HID endpoint (usage_page 0xFF60, usage 0x61)
    devices = [x for x in hid.enumerate() if x['product_string'] == 'Cornix' and x['usage_page'] == 65376 and x['usage'] == 97]
    if not devices:
        # Fallback to any Vial raw HID device
        devices = [x for x in hid.enumerate() if x['usage_page'] == 65376 and x['usage'] == 97]
        if not devices:
            raise Exception("No connected Vial/Cornix keyboard found. Make sure the keyboard is plugged in.")
            
    dev_info = devices[0]
    d = hid.device()
    d.open_path(dev_info['path'])
    
    try:
        # 1. Get protocol version
        buf = [0] * 33
        buf[1] = 0x01
        d.write(bytes(buf))
        res = d.read(32)
        via_proto = res[2]
        
        # 2. Get Vial UID and protocol version
        buf = [0] * 33
        buf[1] = 0x0FE
        buf[2] = 0x00
        d.write(bytes(buf))
        res = d.read(32)
        vial_proto = res[0]
        uid = 0
        for i in range(8):
            uid |= (res[4+i] << (8*i))
            
        # 3. Get dynamic entry sizes (Tap Dance count, Combo count)
        buf = [0] * 33
        buf[1] = 0xFE
        buf[2] = 0x0D
        buf[3] = 0x00
        d.write(bytes(buf))
        res = d.read(32)
        td_count = res[0]
        combo_count = res[1]
        
        # 4. Read layout (10 layers, 8 rows, 7 columns)
        layers_count = 10
        rows_count = 8
        cols_count = 7
        
        layout = []
        for l in range(layers_count):
            layer_rows = []
            for r in range(rows_count):
                row_cols = []
                for c in range(cols_count):
                    buf = [0] * 33
                    buf[1] = 0x04 # DYNAMIC_KEYMAP_GET_KEYCODE
                    buf[2] = l
                    buf[3] = r
                    buf[4] = c
                    d.write(bytes(buf))
                    res = d.read(32)
                    kc_val = (res[4] << 8) | res[5]
                    kc_str = integer_to_keycode_string(kc_val)
                    
                    # Determine if this is a physical key or gap (-1)
                    is_physical = False
                    if r < 4:
                        for k in LEFT_KEYS:
                            if k["matrix_row"] == r and k["matrix_col"] == c:
                                is_physical = True
                                break
                    else:
                        for k in RIGHT_KEYS:
                            if k["matrix_row"] == r and k["matrix_col"] == c:
                                is_physical = True
                                break
                                
                    if not is_physical:
                        row_cols.append(-1)
                    else:
                        row_cols.append(kc_str)
                layer_rows.append(row_cols)
            layout.append(layer_rows)
            
        # 5. Read Tap Dances
        tap_dance = []
        for i in range(td_count):
            buf = [0] * 33
            buf[1] = 0xFE
            buf[2] = 0x0D
            buf[3] = 0x01 # dynamic_vial_tap_dance_get
            buf[4] = i
            d.write(bytes(buf))
            res = d.read(32)
            
            tap_kc = (res[2] << 8) | res[1]
            hold_kc = (res[4] << 8) | res[3]
            dt_kc = (res[6] << 8) | res[5]
            tt_kc = (res[8] << 8) | res[7]
            term = (res[10] << 8) | res[9]
            
            tap_dance.append([
                integer_to_keycode_string(tap_kc),
                integer_to_keycode_string(hold_kc),
                integer_to_keycode_string(dt_kc),
                integer_to_keycode_string(tt_kc),
                term
            ])
            
        # 6. Read Combos
        combo = []
        for i in range(combo_count):
            buf = [0] * 33
            buf[1] = 0xFE
            buf[2] = 0x0D
            buf[3] = 0x03 # dynamic_vial_combo_get
            buf[4] = i
            d.write(bytes(buf))
            res = d.read(32)
            
            in1 = (res[2] << 8) | res[1]
            in2 = (res[4] << 8) | res[3]
            in3 = (res[6] << 8) | res[5]
            in4 = (res[8] << 8) | res[7]
            out = (res[10] << 8) | res[9]
            
            combo.append([
                integer_to_keycode_string(in1),
                integer_to_keycode_string(in2),
                integer_to_keycode_string(in3),
                integer_to_keycode_string(in4),
                integer_to_keycode_string(out)
            ])
            
        # 7. Read Macros
        buf = [0] * 33
        buf[1] = 0x0D # id_dynamic_keymap_macro_get_buffer_size
        d.write(bytes(buf))
        res = d.read(32)
        macro_size = (res[1] << 8) | res[2]
        
        macro_bytes = []
        offset = 0
        while offset < macro_size:
            chunk_size = min(28, macro_size - offset)
            buf = [0] * 33
            buf[1] = 0x0E # id_dynamic_keymap_macro_get_buffer
            buf[2] = (offset >> 8) & 0xFF
            buf[3] = offset & 0xFF
            buf[4] = chunk_size
            d.write(bytes(buf))
            res = d.read(32)
            macro_bytes.extend(res[4:4+chunk_size])
            offset += chunk_size
            
        macro = []
        curr_macro = []
        for b in macro_bytes:
            if b == 0:
                macro.append(decode_macro_bytes(curr_macro))
                curr_macro = []
            else:
                curr_macro.append(b)
        while len(macro) < 32:
            macro.append([])
            
        # 8. Read Encoder Layout
        encoder_layout = []
        for l in range(layers_count):
            layer_encoders = []
            for e in range(2):
                buf = [0] * 33
                buf[1] = 0xFE
                buf[2] = 0x03 # vial_get_encoder
                buf[3] = l
                buf[4] = e
                d.write(bytes(buf))
                res = d.read(32)
                ccw = (res[2] << 8) | res[1]
                cw = (res[4] << 8) | res[3]
                layer_encoders.append([
                    integer_to_keycode_string(ccw),
                    integer_to_keycode_string(cw)
                ])
            layer_encoders_full = [
                layer_encoders[0],
                layer_encoders[1]
            ]
            encoder_layout.append(layer_encoders_full)
            
        data = {
            "version": 1,
            "uid": uid,
            "layout": layout,
            "encoder_layout": encoder_layout,
            "layout_options": 0,
            "macro": macro,
            "vial_protocol": vial_proto,
            "via_protocol": via_proto,
            "tap_dance": tap_dance,
            "combo": combo,
            "key_override": [],
            "alt_repeat_key": [],
            "settings": {"2": 50, "6": 1000, "7": 350, "18": 20, "19": 20, "22": 1, "23": 0, "26": 1, "27": 120}
        }
        return data
        
    finally:
        d.close()


# Predefined key mappings
KEY_MAP = {
    "KC_TAB": "Tab",
    "KC_LSHIFT": "Shift",
    "KC_LGUI": "GUI",
    "KC_LALT": "LAlt",
    "KC_RGUI": "RGUI",
    "KC_RSHIFT": "RShift",
    "KC_SPACE": "Spc",
    "KC_ENTER": "Ent",
    "KC_BSPACE": "BS",
    "KC_MUTE": "Mute",
    "KC_ESCAPE": "Esc",
    "KC_DOT": ".",
    "KC_COMMA": ",",
    "KC_MINUS": "-",
    "KC_SEMICOLON": ";",
    "KC_EQUAL": "=",
    "KC_LBRACKET": "[",
    "KC_RBRACKET": "]",
    "KC_BSLASH": "\\",
    "KC_QUOTE": "'",
    "KC_GRAVE": "`",
    "KC_SLASH": "/",
    "KC_LANG1": "かな",
    "KC_LANG2": "英数",
    "KC_BTN1": "BTN1",
    "KC_BTN3": "BTN3",
    "KC_UP": "↑",
    "KC_DOWN": "↓",
    "KC_LEFT": "←",
    "KC_RIGHT": "→",
    "KC_HOME": "Home",
    "KC_END": "End",
    "KC_BRID": "Brt-",
    "KC_BRIU": "Brt+",
    "KC_VOLD": "Vol-",
    "KC_VOLU": "Vol+",
    "KC_WH_U": "WhUp",
    "KC_WH_D": "WhDn",
    "KC_NO": "",
    "KC_TRNS": "▽",
}

SHIFTED_MAP = {
    "KC_1": "!",
    "KC_2": "@",
    "KC_3": "#",
    "KC_4": "$",
    "KC_5": "%",
    "KC_6": "^",
    "KC_7": "'",
    "KC_8": "*",
    "KC_9": "(",
    "KC_0": ")",
    "KC_MINUS": "_",
    "KC_EQUAL": "+",
    "KC_LBRACKET": "{",
    "KC_RBRACKET": "}",
    "KC_SEMICOLON": ":",
    "KC_QUOTE": '"',
    "KC_GRAVE": "~",
    "KC_SLASH": "?",
    "KC_BSLASH": "|",
    "KC_COMMA": "<",
    "KC_DOT": ">",
}

def translate_simple(keycode):
    if not keycode:
        return ""
    if keycode in KEY_MAP:
        return KEY_MAP[keycode]
    if keycode.startswith("KC_KP_"):
        inner = keycode[6:]
        kp_symbols = {
            "ASTERISK": "*",
            "SLASH": "/",
            "PLUS": "+",
            "MINUS": "-",
            "EQUAL": "=",
            "DOT": ".",
            "COMMA": ",",
        }
        return kp_symbols.get(inner, inner)
    if keycode.startswith("KC_F") and keycode[4:].isdigit():
        return keycode[3:]
    if keycode.startswith("KC_"):
        return keycode[3:]
    return keycode

def parse_keycode(keycode, tap_dance_list):
    """
    Parses a keycode into main_label, sub_label, and category.
    """
    if not keycode or keycode == "-1" or keycode == "KC_NO":
        return {"main_label": "", "sub_label": "", "category": "transparent"}

    if isinstance(keycode, str) and keycode.startswith("KC_") and keycode[3:].isdigit() and int(keycode[3:]) >= 1000:
        val = int(keycode[3:])
        keycode = integer_to_keycode_string(val)

    # TD(n)
    td_match = re.match(r"TD\((\d+)\)", keycode)
    if td_match:
        td_idx = int(td_match.group(1))
        sub_label = f"TD{td_idx}"
        if tap_dance_list and td_idx < len(tap_dance_list):
            tap_action = tap_dance_list[td_idx][0]
            # Recursively parse tap action to get the label
            parsed_tap = parse_keycode(tap_action, [])
            main_label = parsed_tap["main_label"]
            # Classify based on tap action
            category = get_category(tap_action, main_label)
            return {"main_label": main_label, "sub_label": sub_label, "category": category}
        else:
            return {"main_label": keycode, "sub_label": sub_label, "category": "alphabet"}

    # LT<layer>(<key>)
    lt_match = re.match(r"LT(\d+)\((.+)\)", keycode)
    if lt_match:
        layer = lt_match.group(1)
        inner_key = lt_match.group(2)
        main_label = translate_simple(inner_key)
        return {"main_label": main_label, "sub_label": f"LT{layer}", "category": "layer"}

    # LSFT(<key>)
    lsft_match = re.match(r"LSFT\((.+)\)", keycode)
    if lsft_match:
        inner_key = lsft_match.group(1)
        if inner_key in SHIFTED_MAP:
            return {"main_label": SHIFTED_MAP[inner_key], "sub_label": "", "category": "alphabet"}
        return {"main_label": translate_simple(inner_key), "sub_label": "Shift", "category": "alphabet"}

    # RGUI(<key>)
    rgui_match = re.match(r"RGUI\((.+)\)", keycode)
    if rgui_match:
        inner_key = rgui_match.group(1)
        return {"main_label": f"^{translate_simple(inner_key)}", "sub_label": "", "category": "alphabet"}

    # TO(n) / MO(n) / DF(n) / TG(n)
    layer_match = re.match(r"(TO|MO|DF|TG)\((\d+)\)", keycode)
    if layer_match:
        action = layer_match.group(1)
        layer = layer_match.group(2)
        return {"main_label": f"{action}({layer})", "sub_label": "", "category": "layer"}

    main_label = translate_simple(keycode)
    category = get_category(keycode, main_label)
    return {"main_label": main_label, "sub_label": "", "category": category}

def get_category(keycode, parsed_label):
    if keycode in ("KC_NO", "-1"):
        return "transparent"
    if any(p in keycode for p in ("LT", "TO(", "MO(", "DF(", "TG(", "OSL(")):
        return "layer"
    if parsed_label in ("Tab", "Ent", "BS", "Esc", "KC_ENTER", "KC_BSPACE", "KC_TAB", "KC_ESCAPE"):
        return "nav"
    if any(p in keycode for p in ("KC_BTN", "KC_MS_", "KC_WH_")):
        return "mouse"
    if "KC_KP_" in keycode:
        return "numpad"
    if keycode.startswith("KC_F") and keycode[4:].isdigit():
        return "function"
    if keycode in ("KC_LSHIFT", "KC_RSHIFT", "KC_LCTRL", "KC_RCTRL", "KC_LALT", "KC_RALT", "KC_LGUI", "KC_RGUI", "KC_LANG1", "KC_LANG2"):
        return "modifier"
    if keycode.startswith("USER"):
        return "custom"
    if keycode == "M0":
        return "custom"
    return "alphabet"

def get_key_position(r, c, side):
    staggers = {
        0: 0.35,  # pinky outer (Tab, Shift, GUI)
        1: 0.16,  # pinky (Q, A, Z)
        2: 0.06,  # ring (W, S, X)
        3: 0.00,  # middle (E, D, C)
        4: 0.10,  # index (R, F, V)
        5: 0.30,  # index inner (T, G, B)
        6: 0.35,  # extra inner (Mouse 1, Mute)
    }
    
    if side == "left":
        row_equiv = r
        col_equiv = c
    else:
        row_equiv = r - 4
        col_equiv = c
            
    # Align rotary encoder switches (Mouse 1 at row 2, Mute at row 5 -> both to row 2)
    if col_equiv == 6:
        row_equiv = 2
            
    # Base X and Y in units of spacing (1.08 of key size)
    x_units = col_equiv * 1.08
    y_units = row_equiv * 1.08 + staggers.get(col_equiv, 0.0)
    angle = 0
    
    # Thumb keys (row 3 equivalent)
    if row_equiv == 3:
        if col_equiv == 3:
            thumb_idx = 0
        elif col_equiv == 4:
            thumb_idx = 1
        elif col_equiv == 5:
            thumb_idx = 2
        else:
            thumb_idx = -1
                
        if thumb_idx == 0:
            x_units = 3.45
            y_units = 3.50
            angle = 6
        elif thumb_idx == 1:
            x_units = 4.50
            y_units = 3.56
            angle = 12
        elif thumb_idx == 2:
            x_units = 5.55
            y_units = 3.58
            angle = 18
            
    # Extra inner-most (Mouse 1 / Mute)
    if col_equiv == 6:
        angle = 0
        
    if side == "right":
        angle = -angle
        
    return x_units, y_units, angle

# Physical layout mappings
LEFT_KEYS = [
    # Row 0
    {"matrix_row": 0, "matrix_col": 0},
    {"matrix_row": 0, "matrix_col": 1},
    {"matrix_row": 0, "matrix_col": 2},
    {"matrix_row": 0, "matrix_col": 3},
    {"matrix_row": 0, "matrix_col": 4},
    {"matrix_row": 0, "matrix_col": 5},
    # Row 1
    {"matrix_row": 1, "matrix_col": 0},
    {"matrix_row": 1, "matrix_col": 1},
    {"matrix_row": 1, "matrix_col": 2},
    {"matrix_row": 1, "matrix_col": 3},
    {"matrix_row": 1, "matrix_col": 4},
    {"matrix_row": 1, "matrix_col": 5},
    # Row 2
    {"matrix_row": 2, "matrix_col": 0},
    {"matrix_row": 2, "matrix_col": 1},
    {"matrix_row": 2, "matrix_col": 2},
    {"matrix_row": 2, "matrix_col": 3},
    {"matrix_row": 2, "matrix_col": 4},
    {"matrix_row": 2, "matrix_col": 5},
    # Mouse 1
    {"matrix_row": 2, "matrix_col": 6, "is_thumb": True},
    # Thumbs
    {"matrix_row": 3, "matrix_col": 3, "is_thumb": True},
    {"matrix_row": 3, "matrix_col": 4, "is_thumb": True},
    {"matrix_row": 3, "matrix_col": 5, "is_thumb": True},
    # Outer bottom corner keys (4th keys of outer three columns)
    {"matrix_row": 3, "matrix_col": 0},
    {"matrix_row": 3, "matrix_col": 1},
    {"matrix_row": 3, "matrix_col": 2},
]

RIGHT_KEYS = [
    # Row 0
    {"matrix_row": 4, "matrix_col": 0},
    {"matrix_row": 4, "matrix_col": 1},
    {"matrix_row": 4, "matrix_col": 2},
    {"matrix_row": 4, "matrix_col": 3},
    {"matrix_row": 4, "matrix_col": 4},
    {"matrix_row": 4, "matrix_col": 5},
    # Row 1
    {"matrix_row": 5, "matrix_col": 0},
    {"matrix_row": 5, "matrix_col": 1},
    {"matrix_row": 5, "matrix_col": 2},
    {"matrix_row": 5, "matrix_col": 3},
    {"matrix_row": 5, "matrix_col": 4},
    {"matrix_row": 5, "matrix_col": 5},
    # Row 2
    {"matrix_row": 6, "matrix_col": 0},
    {"matrix_row": 6, "matrix_col": 1},
    {"matrix_row": 6, "matrix_col": 2},
    {"matrix_row": 6, "matrix_col": 3},
    {"matrix_row": 6, "matrix_col": 4},
    {"matrix_row": 6, "matrix_col": 5},
    # Mute
    {"matrix_row": 5, "matrix_col": 6, "is_thumb": True},
    # Thumbs
    {"matrix_row": 7, "matrix_col": 5, "is_thumb": True},
    {"matrix_row": 7, "matrix_col": 4, "is_thumb": True},
    {"matrix_row": 7, "matrix_col": 3, "is_thumb": True},
    # Outer bottom corner keys (4th keys of outer three columns)
    {"matrix_row": 7, "matrix_col": 0},
    {"matrix_row": 7, "matrix_col": 1},
    {"matrix_row": 7, "matrix_col": 2},
]

def format_macro_steps(macro_steps):
    formatted = []
    for step in macro_steps:
        if isinstance(step, list) and len(step) >= 2:
            stype, val = step[0], step[1]
            if stype == "text":
                formatted.append(f'"{val}"')
            elif stype == "tap":
                formatted.append(translate_simple(val))
    return " + ".join(formatted)

def main():
    output_file = "index.html"
    from_kb = False
    
    # Parse options
    args = sys.argv[1:]
    
    if "--from-kb" in args:
        from_kb = True
        args.remove("--from-kb")
        
    # Check for output file -o
    if "-o" in args:
        try:
            o_idx = args.index("-o")
            output_file = args[o_idx + 1]
            args.pop(o_idx + 1)
            args.pop(o_idx)
        except IndexError:
            print("Error: -o option requires an output file path.")
            sys.exit(1)
            
    input_file = "cornix0531.vil"
    if args:
        input_file = args[0]
        
    if from_kb:
        print("Reading layout directly from the connected keyboard via raw HID...")
        try:
            data = read_layout_from_keyboard()
        except Exception as e:
            print(f"Error reading from keyboard: {e}")
            sys.exit(1)
    else:
        if not os.path.exists(input_file):
            if input_file == "cornix0531.vil" and HAS_HID:
                print("Default input file not found. Attempting to read from connected keyboard...")
                try:
                    data = read_layout_from_keyboard()
                    from_kb = True
                except Exception as kb_err:
                    print(f"Error reading from keyboard: {kb_err}")
                    print(f"Error: Default input file '{input_file}' not found.")
                    sys.exit(1)
            else:
                print(f"Error: Input file '{input_file}' not found.")
                sys.exit(1)
        else:
            with open(input_file, 'r', encoding='utf-8') as f:
                data = json.load(f)

    if from_kb:
        backup_filename = f"cornix{datetime.now().strftime('%m%d')}.vil"
        try:
            with open(backup_filename, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False)
            print(f"Saved backup configuration to '{backup_filename}'.")
        except Exception as save_err:
            print(f"Warning: Could not save backup configuration: {save_err}")
        
    layout = data.get("layout", [])
    tap_dance_list = data.get("tap_dance", [])
    combo_list = data.get("combo", [])
    macro_list = data.get("macro", [])
    encoder_layout = data.get("encoder_layout", [])
    
    # 1. Determine active layers
    # We display up to 3 layers: Layer 0 (Base), Layer 1 (Numpad), Layer 2 (Fn)
    layers_to_render = [0, 1, 2]
    layer_names = {
        0: "Layer 0: BASE",
        1: "Layer 1: NUMPAD",
        2: "Layer 2: FN"
    }
    
    # Scan active layers to find all used Tap Dances, Combos, and Macros
    used_tds = set()
    used_macros = set()
    
    # Find combo participation keycodes to flag them with a dagger symbol
    # Combo entries look like: [k1, k2, k3, k4, result]
    active_combos = []
    combo_input_keys = set()
    for c_idx, c_data in enumerate(combo_list):
        result = c_data[-1]
        if result and result != "KC_NO":
            inputs = [k for k in c_data[:-1] if k and k != "KC_NO"]
            if len(inputs) >= 2:
                active_combos.append({
                    "index": c_idx,
                    "inputs": inputs,
                    "result": result
                })
                for inp in inputs:
                    combo_input_keys.add(inp)

    # Render key helper
    def render_keycap(layer_idx, key_def, side):
        r = key_def["matrix_row"]
        c = key_def["matrix_col"]
        is_thumb = key_def.get("is_thumb", False)
        
        # Get keycode
        keycode = "KC_NO"
        if layer_idx < len(layout) and r < len(layout[layer_idx]) and c < len(layout[layer_idx][r]):
            keycode = layout[layer_idx][r][c]
            
        parsed = parse_keycode(keycode, tap_dance_list)
        main_label = parsed["main_label"]
        sub_label = parsed["sub_label"]
        category = parsed["category"]
        
        # If it is a transparent key, but we are in Layer 1 or 2, we display it as empty/transparent
        if keycode == "KC_TRNS" or keycode == "KC_NO":
            if layer_idx > 0:
                # Transparents on higher layers have no text, just class transparent
                main_label = ""
                sub_label = ""
                category = "transparent"
                
        # Track used TDs
        if keycode.startswith("TD("):
            td_match = re.match(r"TD\((\d+)\)", keycode)
            if td_match:
                used_tds.add(int(td_match.group(1)))
                
        # Track used macros
        if keycode.startswith("M") and keycode[1:].isdigit():
            used_macros.add(int(keycode[1:]))
            
        # Check combo participation
        is_combo_key = keycode in combo_input_keys
        
        # Get absolute positions
        x_units, y_units, angle = get_key_position(r, c, side)
        style_attrs = []
        if side == "left":
            style_attrs.append(f"left: calc({x_units:.3f} * var(--key-size))")
        else:
            style_attrs.append(f"right: calc({x_units:.3f} * var(--key-size))")
            
        style_attrs.append(f"top: calc({y_units:.3f} * var(--key-size))")
        if angle != 0:
            style_attrs.append(f"transform: rotate({angle}deg)")
            
        style_str = "; ".join(style_attrs)
        
        classes = ["key-cell"]
        if is_thumb:
            classes.append("thumb-key")
            
        keycap_classes = ["keycap", f"cat-{category}"]
        
        inner_html = ""
        if sub_label:
            # For Layer-Tap, put LT at top left. For Tap-Dance, put TD at bottom right
            if sub_label.startswith("LT"):
                inner_html += f'<span class="top-sub-label">{sub_label}</span>'
            else:
                inner_html += f'<span class="sub-label">{sub_label}</span>'
                
        if is_combo_key:
            inner_html += '<span class="combo-mark">†</span>'
            
        # Format main label to handle lines
        display_label = main_label
        if "\n" in main_label:
            display_label = main_label.replace("\n", "<br>")
            
        inner_html += f'<span class="main-label">{display_label}</span>'
        
        return f'<div class="{" ".join(classes)}" style="{style_str}"><div class="{" ".join(keycap_classes)}">{inner_html}</div></div>'

    # Build Layers HTML
    layers_html = []
    for l_idx in layers_to_render:
        left_keys_html = []
        for k_def in LEFT_KEYS:
            left_keys_html.append(render_keycap(l_idx, k_def, "left"))
            
        right_keys_html = []
        for k_def in RIGHT_KEYS:
            right_keys_html.append(render_keycap(l_idx, k_def, "right"))
            
        layer_title = layer_names.get(l_idx, f"Layer {l_idx}")
        
        layer_box = f"""
        <div class="layer-section">
            <h3 class="layer-title">{layer_title}</h3>
            <div class="keyboard-layout">
                <div class="keyboard-half left-half">
                    {"".join(left_keys_html)}
                </div>
                <div class="keyboard-half right-half">
                    {"".join(right_keys_html)}
                </div>
            </div>
        </div>
        """
        layers_html.append(layer_box)

    # 2. Build Tap Dance Table
    td_rows = []
    # Find the maximum index that has any configuration
    max_config_idx = -1
    for idx, td_data in enumerate(tap_dance_list):
        if any(k != "KC_NO" for k in td_data[:4]):
            max_config_idx = idx
            
    if max_config_idx >= 0:
        for td_idx in range(max_config_idx + 1):
            td_data = tap_dance_list[td_idx]
            tap = td_data[0]
            hold = td_data[1]
            double_tap = td_data[2]
            triple_tap = td_data[3]
            term = td_data[4]
            
            # Check if it is empty
            is_empty = all(k == "KC_NO" for k in (tap, hold, double_tap, triple_tap))
            is_placed = td_idx in used_tds
            
            if is_empty:
                td_rows.append(f"""
                <tr style="opacity: 0.35;">
                    <td><strong>TD({td_idx})</strong></td>
                    <td><span class="badge cat-transparent">-</span></td>
                    <td style="color: #94a3b8; font-style: italic;">（未設定）</td>
                    <td class="note-cell" style="color: #94a3b8; font-style: italic;">設定なし</td>
                </tr>
                """)
            else:
                tap_parsed = parse_keycode(tap, [])
                hold_parsed = parse_keycode(hold, [])
                dt_parsed = parse_keycode(double_tap, [])
                
                tap_lbl = tap_parsed["main_label"] if tap != "KC_NO" else "-"
                
                # Combine hold, double-tap, etc.
                hold_lbls = []
                if hold != "KC_NO":
                    hold_lbls.append(f"Hold: {hold_parsed['main_label']}")
                if double_tap != "KC_NO":
                    hold_lbls.append(f"Double-tap: {dt_parsed['main_label']}")
                if triple_tap != "KC_NO":
                    triple_parsed = parse_keycode(triple_tap, [])
                    hold_lbls.append(f"Triple-tap: {triple_parsed['main_label']}")
                    
                hold_str = "<br>".join(hold_lbls) if hold_lbls else "-"
                
                notes = []
                if term != 250:
                    notes.append(f"T={term}ms")
                if not is_placed:
                    notes.append('<span style="color: #d97706; font-weight: 600; background-color: #fffbeb; padding: 2px 4px; border-radius: 3px; border: 1px solid #fef3c7;">未配置</span>')
                    
                note_str = " / ".join(notes) if notes else ""
                
                # Unplaced rows get slightly dimmed to indicate they are not active in layout
                row_style = ' style="opacity: 0.7;"' if not is_placed else ''
                
                td_rows.append(f"""
                <tr{row_style}>
                    <td><strong>TD({td_idx})</strong></td>
                    <td><span class="badge cat-{tap_parsed['category']}">{tap_lbl}</span></td>
                    <td>{hold_str}</td>
                    <td class="note-cell">{note_str}</td>
                </tr>
                """)
            
    td_table_html = """
    <div class="table-section">
        <h4>Tap Dance 設定</h4>
        <table>
            <thead>
                <tr>
                    <th>TD</th>
                    <th>Tap</th>
                    <th>Hold / Double-Tap</th>
                    <th>備考</th>
                </tr>
            </thead>
            <tbody>
                {rows}
            </tbody>
        </table>
    </div>
    """.format(rows="".join(td_rows)) if td_rows else ""

    # 3. Build Combo Table
    combo_rows = []
    for combo in active_combos:
        # Resolve inputs
        inp_labels = []
        for inp in combo["inputs"]:
            parsed_inp = parse_keycode(inp, tap_dance_list)
            inp_labels.append(f'<span class="badge cat-{parsed_inp["category"]}">{parsed_inp["main_label"]}</span>')
            
        parsed_res = parse_keycode(combo["result"], tap_dance_list)
        res_lbl = f'<span class="badge cat-{parsed_res["category"]}">{parsed_res["main_label"]}</span>'
        
        combo_rows.append(f"""
        <tr>
            <td>{" + ".join(inp_labels)}</td>
            <td>{res_lbl}</td>
        </tr>
        """)
        
    combo_table_html = """
    <div class="table-section">
        <h4>Combo 設定</h4>
        <table>
            <thead>
                <tr>
                    <th>入力キー</th>
                    <th>結果</th>
                </tr>
            </thead>
            <tbody>
                {rows}
            </tbody>
        </table>
    </div>
    """.format(rows="".join(combo_rows)) if combo_rows else ""

    # 4. Build Macro Table
    macro_rows = []
    for m_idx in sorted(used_macros):
        if m_idx < len(macro_list):
            steps = macro_list[m_idx]
            formatted_steps = format_macro_steps(steps)
            
            # Custom note for M0 as requested in requirements
            desc = ""
            if m_idx == 0:
                desc = '<span class="desc-text">(括弧を入力し、カーソルを中に戻す)</span>'
                
            macro_rows.append(f"""
            <tr>
                <td><strong>M{m_idx}</strong></td>
                <td><code>{formatted_steps}</code> {desc}</td>
            </tr>
            """)
            
    macro_table_html = """
    <div class="table-section">
        <h4>Macro 設定</h4>
        <table>
            <thead>
                <tr>
                    <th>Macro</th>
                    <th>動作内容</th>
                </tr>
            </thead>
            <tbody>
                {rows}
            </tbody>
        </table>
    </div>
    """.format(rows="".join(macro_rows)) if macro_rows else ""

    # 5. Legend & Encoders Area
    legend_html = """
    <div class="legend-section">
        <h4>凡例</h4>
        <div class="legend-grid">
            <div class="legend-item"><span class="legend-color cat-alphabet"></span> アルファベット/記号</div>
            <div class="legend-item"><span class="legend-color cat-modifier"></span> 修飾キー (Shift/GUI等)</div>
            <div class="legend-item"><span class="legend-color cat-layer"></span> レイヤー切替 (LT/TO/MO)</div>
            <div class="legend-item"><span class="legend-color cat-nav"></span> ナビゲーション (Ent/BS/Tab)</div>
            <div class="legend-item"><span class="legend-color cat-custom"></span> カスタム (Macro/M0)</div>
            <div class="legend-item"><span class="legend-color cat-mouse"></span> マウス操作 (BTN)</div>
            <div class="legend-item"><span class="legend-color cat-numpad"></span> テンキー</div>
            <div class="legend-item"><span class="legend-color cat-function"></span> ファンクション (F1-F12)</div>
        </div>
        
        <h4 style="margin-top: 12px; margin-bottom: 6px;">エンコーダー設定</h4>
        <table class="encoder-table">
            <thead>
                <tr>
                    <th>位置</th>
                    <th>動作 (反時計 / 時計回り)</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td><strong>左 (Encoder 0)</strong></td>
                    <td>Brt- / Brt+ <span class="note-text">(Base/Num)</span><br>Vol- / Vol+ <span class="note-text">(Fn)</span></td>
                </tr>
                <tr>
                    <td><strong>右 (Encoder 1)</strong></td>
                    <td>Vol- / Vol+ <span class="note-text">(Base/Num)</span><br>WhUp / WhDn <span class="note-text">(Fn)</span></td>
                </tr>
            </tbody>
        </table>
    </div>
    """

    # HTML Output Template
    html_template = """<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Cornix Layout Cheat Sheet</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700&family=Noto+Sans+JP:wght@400;500;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg-color: #f8fafc;
            --text-color: #1e293b;
            --card-bg: #ffffff;
            --border-color: #e2e8f0;
            --title-color: #0f172a;
            
            --key-size: 21px;
            --key-gap: 3px;
            
            /* Category Colors (Gorgeous HSL Palette) */
            --cat-alphabet-bg: #ffffff;
            --cat-alphabet-text: #1e293b;
            --cat-alphabet-border: #cbd5e1;
            
            --cat-modifier-bg: #f1f5f9;
            --cat-modifier-text: #475569;
            --cat-modifier-border: #cbd5e1;
            
            --cat-layer-bg: #f0fdf4;
            --cat-layer-text: #166534;
            --cat-layer-border: #bbf7d0;
            
            --cat-nav-bg: #fff7ed;
            --cat-nav-text: #c2410c;
            --cat-nav-border: #fed7aa;
            
            --cat-custom-bg: #fef2f2;
            --cat-custom-text: #991b1b;
            --cat-custom-border: #fecaca;
            
            --cat-mouse-bg: #faf5ff;
            --cat-mouse-text: #6b21a8;
            --cat-mouse-border: #e9d5ff;
            
            --cat-numpad-bg: #fefce8;
            --cat-numpad-text: #854d0e;
            --cat-numpad-border: #fef08a;
            
            --cat-function-bg: #f0f9ff;
            --cat-function-text: #075985;
            --cat-function-border: #bae6fd;
            
            --cat-transparent-bg: rgba(255, 255, 255, 0.4);
            --cat-transparent-text: #94a3b8;
            --cat-transparent-border: #cbd5e1;
        }

        @page {
            size: A4 landscape;
            margin: 6mm 8mm;
        }

        body {
            font-family: 'Outfit', 'Noto Sans JP', sans-serif;
            background-color: var(--bg-color);
            color: var(--text-color);
            margin: 0;
            padding: 0;
            line-height: 1.3;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
        }

        .container {
            width: 100%;
            max-width: 1120px;
            margin: 0 auto;
            padding: 4px;
            box-sizing: border-box;
        }

        header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid var(--border-color);
            padding-bottom: 4px;
            margin-bottom: 12px;
        }

        header h1 {
            font-size: 16px;
            font-weight: 700;
            color: var(--title-color);
            margin: 0;
            letter-spacing: 0.5px;
        }

        header .meta {
            font-size: 9px;
            color: #64748b;
            font-weight: 500;
        }

        /* Keyboard layouts section */
        .layers-container {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 12px;
            margin-bottom: 12px;
        }

        .layer-section {
            background-color: var(--card-bg);
            border-radius: 8px;
            padding: 8px;
            border: 1px solid var(--border-color);
            box-shadow: 0 1px 3px rgba(0,0,0,0.02);
        }

        .layer-title {
            font-size: 11px;
            font-weight: 700;
            margin-top: 0;
            margin-bottom: 12px;
            color: var(--title-color);
            border-bottom: 1px solid var(--border-color);
            padding-bottom: 4px;
            text-align: center;
        }

        .keyboard-layout {
            display: flex;
            justify-content: center;
            gap: 16px;
            padding: 4px 0 16px 0;
        }

        .keyboard-half {
            position: relative;
            width: calc(7.6 * var(--key-size));
            height: calc(5.0 * var(--key-size));
            background-color: #f1f5f9;
            border-radius: 8px;
            padding: 8px;
            box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.02);
            border: 1px solid #cbd5e1;
            box-sizing: border-box;
        }

        .key-cell {
            position: absolute;
            width: var(--key-size);
            height: var(--key-size);
            display: flex;
            justify-content: center;
            align-items: center;
            box-sizing: border-box;
        }

        .keycap {
            width: 100%;
            height: 100%;
            border-radius: 4px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            position: relative;
            box-sizing: border-box;
            box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
            font-size: 7px;
            font-weight: 600;
            transition: transform 0.15s ease, box-shadow 0.15s ease;
            user-select: none;
        }

        .keycap:hover {
            transform: translateY(-1.5px) scale(1.03);
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.08);
            z-index: 10;
        }

        .keycap .main-label {
            text-align: center;
            line-height: 1.1;
        }

        .keycap .sub-label {
            position: absolute;
            bottom: 1.5px;
            right: 2px;
            font-size: 4px;
            color: #64748b;
            font-weight: 500;
        }

        .keycap .top-sub-label {
            position: absolute;
            top: 1.5px;
            left: 2px;
            font-size: 4.5px;
            color: #475569;
            font-weight: 600;
        }

        .keycap .combo-mark {
            position: absolute;
            top: 1.5px;
            right: 2px;
            font-size: 5px;
            color: #ef4444;
            font-weight: 700;
        }

        /* Categories color classes */
        .cat-alphabet {
            background-color: var(--cat-alphabet-bg);
            color: var(--cat-alphabet-text);
            border: 1px solid var(--cat-alphabet-border);
        }

        .cat-modifier {
            background-color: var(--cat-modifier-bg);
            color: var(--cat-modifier-text);
            border: 1px solid var(--cat-modifier-border);
        }

        .cat-layer {
            background-color: var(--cat-layer-bg);
            color: var(--cat-layer-text);
            border: 1px solid var(--cat-layer-border);
        }

        .cat-nav {
            background-color: var(--cat-nav-bg);
            color: var(--cat-nav-text);
            border: 1px solid var(--cat-nav-border);
        }

        .cat-custom {
            background-color: var(--cat-custom-bg);
            color: var(--cat-custom-text);
            border: 1.5px solid var(--cat-custom-border);
        }

        .cat-mouse {
            background-color: var(--cat-mouse-bg);
            color: var(--cat-mouse-text);
            border: 1px solid var(--cat-mouse-border);
        }

        .cat-numpad {
            background-color: var(--cat-numpad-bg);
            color: var(--cat-numpad-text);
            border: 1px solid var(--cat-numpad-border);
        }

        .cat-function {
            background-color: var(--cat-function-bg);
            color: var(--cat-function-text);
            border: 1px solid var(--cat-function-border);
        }

        .cat-transparent {
            background-color: var(--cat-transparent-bg);
            color: var(--cat-transparent-text);
            border: 1px dashed var(--cat-transparent-border);
            box-shadow: none;
        }

        /* Bottom informational area */
        .bottom-area {
            display: grid;
            grid-template-columns: 1.2fr 1.6fr 1.6fr 1fr;
            gap: 12px;
        }

        .bottom-card {
            background-color: var(--card-bg);
            border-radius: 8px;
            padding: 8px;
            border: 1px solid var(--border-color);
            box-shadow: 0 1px 3px rgba(0,0,0,0.02);
            font-size: 8px;
        }

        .bottom-card h4 {
            font-size: 9.5px;
            font-weight: 700;
            margin-top: 0;
            margin-bottom: 6px;
            color: var(--title-color);
            border-bottom: 1.5px solid var(--border-color);
            padding-bottom: 3px;
        }

        .bottom-card table {
            width: 100%;
            border-collapse: collapse;
        }

        .bottom-card th, .bottom-card td {
            padding: 3px 4px;
            text-align: left;
            border-bottom: 1px solid #f1f5f9;
        }

        .bottom-card th {
            font-weight: 600;
            color: #64748b;
        }

        /* Legend specific styles */
        .legend-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 4px;
        }

        .legend-item {
            display: flex;
            align-items: center;
            gap: 4px;
            font-size: 8px;
        }

        .legend-color {
            width: 10px;
            height: 10px;
            border-radius: 2px;
            display: inline-block;
            box-shadow: 0 1px 1px rgba(0,0,0,0.05);
        }

        .encoder-table {
            margin-top: 4px;
        }

        .note-text {
            color: #94a3b8;
            font-size: 7px;
        }

        /* Badges for tables */
        .badge {
            padding: 1px 4px;
            border-radius: 3px;
            font-size: 7.5px;
            font-weight: 600;
            display: inline-block;
        }

        code {
            font-family: 'JetBrains Mono', Courier, monospace;
            background-color: #f1f5f9;
            padding: 1px 3px;
            border-radius: 2px;
            font-size: 7.5px;
        }

        .desc-text {
            color: #64748b;
            font-size: 7.5px;
        }

        .note-cell {
            color: #64748b;
            font-weight: 500;
        }

        /* Print styles */
        @media print {
            body {
                background-color: #ffffff;
                color: #000000;
            }
            .layer-section, .bottom-card {
                box-shadow: none;
                border: 1px solid #cbd5e1;
            }
            .keycap {
                box-shadow: none;
            }
            .keycap:hover {
                transform: none;
                box-shadow: none;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>Cornix Layout Cheat Sheet</h1>
            <div class="meta">Keyboard: Cornix (Split 42 Keys) | Vial Layout Configuration</div>
        </header>

        <div class="layers-container">
            {layers_html}
        </div>

        <div class="bottom-area">
            <div class="bottom-card">
                {legend_html}
            </div>
            
            <div class="bottom-card">
                {td_table_html}
            </div>
            
            <div class="bottom-card">
                {combo_table_html}
            </div>
            
            <div class="bottom-card">
                {macro_table_html}
            </div>
        </div>
    </div>
</body>
</html>
"""

    html_content = html_template.replace("{layers_html}", "".join(layers_html)) \
                                 .replace("{legend_html}", legend_html) \
                                 .replace("{td_table_html}", td_table_html) \
                                 .replace("{combo_table_html}", combo_table_html) \
                                 .replace("{macro_table_html}", macro_table_html)
    
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(html_content)
        
    print(f"Success! Cheat sheet generated at '{output_file}'.")

if __name__ == "__main__":
    main()
