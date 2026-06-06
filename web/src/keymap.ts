import { KeyEntry, TapDanceEntry } from './types';

// --- 基本キーコードのマップ定義 ---
export const BASIC_KEYCODES: Record<number, string> = {
  0: "KC_NO",
  1: "KC_TRNS",
};

// A-Z
for (let i = 0; i < 26; i++) {
  BASIC_KEYCODES[4 + i] = `KC_${String.fromCharCode(65 + i)}`;
}
// 1-0
for (let i = 0; i < 10; i++) {
  const num = (i + 1) % 10;
  BASIC_KEYCODES[30 + i] = `KC_${num}`;
}
// F1-F12
for (let i = 1; i <= 12; i++) {
  BASIC_KEYCODES[57 + i] = `KC_F${i}`;
}

// その他の特殊キーコード
Object.assign(BASIC_KEYCODES, {
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
});

// --- 表示用ラベルのマッピング ---
export const KEY_MAP: Record<string, string> = {
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
};

// シフト修飾キー適用時のシンボルマップ
export const SHIFTED_MAP: Record<string, string> = {
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
};

/**
 * 16bit整数キーコードからQMKキーコード文字列に変換します
 */
export function integerToKeycodeString(kc: number): string {
  if (kc === 0) return "KC_NO";
  if (kc === 1) return "KC_TRNS";
  
  // Tap Dance
  if (kc >= 0x5700 && kc <= 0x57FF) {
    return `TD(${kc & 0xFF})`;
  }
  // Macro
  if (kc >= 0x7700 && kc <= 0x77FF) {
    return `M${kc & 0xFF}`;
  }
  // Layer Tap
  if (kc >= 0x4000 && kc <= 0x4FFF) {
    const layer = (kc >> 8) & 0x0F;
    const inner = kc & 0xFF;
    const innerStr = BASIC_KEYCODES[inner] || `KC_${inner}`;
    return `LT${layer}(${innerStr})`;
  }
  // User keycodes
  if (kc >= 0x7E00 && kc <= 0x7FFF) {
    const idx = kc & 0xFF;
    return `USER${idx.toString().padStart(2, '0')}`;
  }
  // Layer switching
  if (kc >= 0x5200 && kc <= 0x521F) return `TO(${kc & 0x1F})`;
  if (kc >= 0x5220 && kc <= 0x523F) return `MO(${kc & 0x1F})`;
  if (kc >= 0x5240 && kc <= 0x525F) return `TG(${kc & 0x1F})`;
  if (kc >= 0x5260 && kc <= 0x527F) return `DF(${kc & 0x1F})`;
  if (kc >= 0x5280 && kc <= 0x529F) return `TT(${kc & 0x1F})`;
  if (kc >= 0x52A0 && kc <= 0x52BF) return `OSL(${kc & 0x1F})`;

  // Mods
  const mods = (kc >> 8) & 0x1F;
  if (mods !== 0 && (kc & 0xE000) === 0) {
    const inner = kc & 0xFF;
    const innerStr = BASIC_KEYCODES[inner] || `KC_${inner}`;
    const modNames: Record<number, string> = {
      0x01: "LCTL", 0x02: "LSFT", 0x04: "LALT", 0x08: "LGUI",
      0x11: "RCTL", 0x12: "RSFT", 0x14: "RALT", 0x18: "RGUI"
    };
    const modStr = modNames[mods];
    if (modStr) return `${modStr}(${innerStr})`;
  }

  return BASIC_KEYCODES[kc] || `KC_${kc}`;
}

/**
 * キーコードから簡易表示用の文字を取得します
 */
export function translateSimple(keycode: string): string {
  if (!keycode) return "";
  if (KEY_MAP[keycode] !== undefined) {
    return KEY_MAP[keycode];
  }
  if (keycode.startsWith("KC_KP_")) {
    const inner = keycode.slice(6);
    const kpSymbols: Record<string, string> = {
      "ASTERISK": "*",
      "SLASH": "/",
      "PLUS": "+",
      "MINUS": "-",
      "EQUAL": "=",
      "DOT": ".",
      "COMMA": ",",
    };
    return kpSymbols[inner] || inner;
  }
  if (keycode.startsWith("KC_F") && /^\d+$/.test(keycode.slice(4))) {
    return keycode.slice(3); // F1, F2 等
  }
  if (keycode.startsWith("KC_")) {
    return keycode.slice(3);
  }
  return keycode;
}

export interface ParsedKey {
  mainLabel: string;
  subLabel: string;
  category: string;
}

/**
 * 表示用のカテゴリをキーコードと表示ラベルから分類します
 */
export function getCategory(keycode: string, parsedLabel: string): string {
  if (keycode === "KC_NO" || keycode === "-1" || keycode === "") {
    return "transparent";
  }
  if (/LT\d+\(|TO\(|MO\(|DF\(|TG\(|OSL\(/.test(keycode)) {
    return "layer";
  }
  if (["Tab", "Ent", "BS", "Esc", "KC_ENTER", "KC_BSPACE", "KC_TAB", "KC_ESCAPE"].includes(parsedLabel) || 
      ["KC_ENTER", "KC_BSPACE", "KC_TAB", "KC_ESCAPE"].includes(keycode)) {
    return "nav";
  }
  if (keycode.includes("KC_BTN") || keycode.includes("KC_MS_") || keycode.includes("KC_WH_")) {
    return "mouse";
  }
  if (keycode.includes("KC_KP_")) {
    return "numpad";
  }
  if (keycode.startsWith("KC_F") && /^\d+$/.test(keycode.slice(4))) {
    return "function";
  }
  if (["KC_LSHIFT", "KC_RSHIFT", "KC_LCTRL", "KC_RCTRL", "KC_LALT", "KC_RALT", "KC_LGUI", "KC_RGUI", "KC_LANG1", "KC_LANG2"].includes(keycode)) {
    return "modifier";
  }
  if (keycode.startsWith("USER") || keycode === "M0") {
    return "custom";
  }
  return "alphabet";
}

/**
 * キーコード文字列をパースし、表示用のメインラベル、サブラベル、カテゴリに分類します
 */
export function parseKeycode(keycode: string, tapDanceList: TapDanceEntry[]): ParsedKey {
  if (!keycode || keycode === "-1" || keycode === "KC_NO") {
    return { mainLabel: "", subLabel: "", category: "transparent" };
  }

  // 数値キーコードが含まれる場合のフォールバック
  if (keycode.startsWith("KC_") && /^\d+$/.test(keycode.slice(3)) && parseInt(keycode.slice(3), 10) >= 1000) {
    const val = parseInt(keycode.slice(3), 10);
    keycode = integerToKeycodeString(val);
  }

  // TD(n) の処理
  const tdMatch = keycode.match(/^TD\((\d+)\)$/);
  if (tdMatch) {
    const tdIdx = parseInt(tdMatch[1], 10);
    const subLabel = `TD${tdIdx}`;
    if (tapDanceList && tdIdx < tapDanceList.length) {
      const tapAction = tapDanceList[tdIdx][0];
      // タップアクションを再帰的にパース
      const parsedTap = parseKeycode(tapAction, []);
      const mainLabel = parsedTap.mainLabel;
      const category = getCategory(tapAction, mainLabel);
      return { mainLabel, subLabel, category };
    }
    return { mainLabel: keycode, subLabel, category: "alphabet" };
  }

  // LT<layer>(<key>)
  const ltMatch = keycode.match(/^LT(\d+)\((.+)\)$/);
  if (ltMatch) {
    const layer = ltMatch[1];
    const innerKey = ltMatch[2];
    const mainLabel = translateSimple(innerKey);
    return { mainLabel, subLabel: `LT${layer}`, category: "layer" };
  }

  // LSFT(<key>)
  const lsftMatch = keycode.match(/^LSFT\((.+)\)$/);
  if (lsftMatch) {
    const innerKey = lsftMatch[1];
    if (SHIFTED_MAP[innerKey] !== undefined) {
      return { mainLabel: SHIFTED_MAP[innerKey], subLabel: "", category: "alphabet" };
    }
    return { mainLabel: translateSimple(innerKey), subLabel: "Shift", category: "alphabet" };
  }

  // RGUI(<key>)
  const rguiMatch = keycode.match(/^RGUI\((.+)\)$/);
  if (rguiMatch) {
    const innerKey = rguiMatch[1];
    return { mainLabel: `^${translateSimple(innerKey)}`, subLabel: "", category: "alphabet" };
  }

  // TO(n) / MO(n) / DF(n) / TG(n) / OSL(n)
  const layerMatch = keycode.match(/^(TO|MO|DF|TG|OSL)\((\d+)\)$/);
  if (layerMatch) {
    const action = layerMatch[1];
    const layer = layerMatch[2];
    return { mainLabel: `${action}(${layer})`, subLabel: "", category: "layer" };
  }

  const mainLabel = translateSimple(keycode);
  const category = getCategory(keycode, mainLabel);
  return { mainLabel, subLabel: "", category };
}

/**
 * キーマップの透過キー (KC_TRNS) を解決し、継承情報を追加した KeyEntry の3次元配列を返します。
 * @param rawLayout 生のキーコード定義 [layer][row][col]。セルが -1 の箇所は物理的な隙間(物理キーなし)を示します。
 *                  -1 の値は主に WebHID デバイスからの読み取り時に物理キーマップ外の座標で発生し、また .vil JSON 内でも隙間定義として含まれます。
 */
export function resolveKeymap(rawLayout: (string | number)[][][]): KeyEntry[][][] {
  const layersCount = rawLayout.length;
  const rowsCount = rawLayout[0]?.length || 0;
  const colsCount = rawLayout[0]?.[0]?.length || 0;

  const resolvedLayout: KeyEntry[][][] = [];
  
  // 1. 初期コピー
  for (let l = 0; l < layersCount; l++) {
    const layerRows: KeyEntry[][] = [];
    for (let r = 0; r < rowsCount; r++) {
      const rowCols: KeyEntry[] = [];
      for (let c = 0; c < colsCount; c++) {
        const rawVal = rawLayout[l]?.[r]?.[c];
        const rawStr = rawVal === -1 || rawVal === undefined ? "-1" : String(rawVal);
        rowCols.push({
          raw: rawStr,
          resolved: rawStr,
          inheritedFrom: null
        });
      }
      layerRows.push(rowCols);
    }
    resolvedLayout.push(layerRows);
  }

  // 2. 透過キー (KC_TRNS) のレイヤー順走査解決
  for (let l = 0; l < layersCount; l++) {
    for (let r = 0; r < rowsCount; r++) {
      for (let c = 0; c < colsCount; c++) {
        const entry = resolvedLayout[l][r][c];
        if (entry.raw === "KC_TRNS") {
          let resolved = "KC_TRNS";
          let inheritedFrom: number | null = null;
          // 下位レイヤーを順に遡る
          for (let targetL = l - 1; targetL >= 0; targetL--) {
            const targetEntry = resolvedLayout[targetL][r][c];
            if (targetEntry.raw !== "KC_TRNS" && targetEntry.raw !== "-1") {
              resolved = targetEntry.resolved; // 既に解決された表示名を取得
              inheritedFrom = targetL;
              break;
            }
          }
          entry.resolved = resolved;
          entry.inheritedFrom = inheritedFrom;
        }
      }
    }
  }

  return resolvedLayout;
}

/**
 * ロータリーエンコーダーの透過設定 (KC_TRNS) を解決します。
 * @param rawEncoderLayout 生のエンコーダー配列 [layer][encoder_idx][ccw_or_cw] (ccw=0, cw=1)
 */
export function resolveEncoderLayout(rawEncoderLayout: (string | number)[][][]): KeyEntry[][][] {
  const layersCount = rawEncoderLayout.length;
  const encoderCount = rawEncoderLayout[0]?.length || 0;
  const directionsCount = 2; // 0=CCW, 1=CW

  const resolvedEncoder: KeyEntry[][][] = [];
  
  // 1. 初期コピー
  for (let l = 0; l < layersCount; l++) {
    const layerEncoders: KeyEntry[][] = [];
    for (let e = 0; e < encoderCount; e++) {
      const ccwVal = rawEncoderLayout[l]?.[e]?.[0];
      const cwVal = rawEncoderLayout[l]?.[e]?.[1];
      const ccwStr = ccwVal === undefined ? "KC_NO" : String(ccwVal);
      const cwStr = cwVal === undefined ? "KC_NO" : String(cwVal);
      layerEncoders.push([
        { raw: ccwStr, resolved: ccwStr, inheritedFrom: null },
        { raw: cwStr, resolved: cwStr, inheritedFrom: null }
      ]);
    }
    resolvedEncoder.push(layerEncoders);
  }

  // 2. 透過解決
  for (let l = 0; l < layersCount; l++) {
    for (let e = 0; e < encoderCount; e++) {
      for (let dir = 0; dir < directionsCount; dir++) {
        const entry = resolvedEncoder[l][e][dir];
        if (entry.raw === "KC_TRNS") {
          let resolved = "KC_TRNS";
          let inheritedFrom: number | null = null;
          for (let targetL = l - 1; targetL >= 0; targetL--) {
            const targetEntry = resolvedEncoder[targetL][e][dir];
            if (targetEntry.raw !== "KC_TRNS" && targetEntry.raw !== "KC_NO") {
              resolved = targetEntry.resolved;
              inheritedFrom = targetL;
              break;
            }
          }
          entry.resolved = resolved;
          entry.inheritedFrom = inheritedFrom;
        }
      }
    }
  }

  return resolvedEncoder;
}
