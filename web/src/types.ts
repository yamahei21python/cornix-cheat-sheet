export interface KeyEntry {
  raw: string;                 // 元のキーコード (例: "KC_TRNS" / "KC_A" / "-1")
  resolved: string;            // 透過などを解決した後の表示用キーコード
  inheritedFrom: number | null; // 継承元のレイヤー番号 (自レイヤーの場合は null)
}

export interface MacroAction {
  type: 'down' | 'up' | 'tap' | 'delay' | 'text';
  value: string | number;
}

export type TapDanceEntry = [string, string, string, string, number];

export interface VialKeyboardData {
  layout: KeyEntry[][][]; // [layer][row][col]
  tapDance: TapDanceEntry[]; // [index]
  combo: { index: number; inputs: [string, string, string?, string?]; result: string }[];
  macro: MacroAction[][]; // [index]
  encoderLayout: KeyEntry[][][]; // [layer][encoder_idx][ccw_or_cw] (ccw=0, cw=1)
}

// --- Vial WebHID 通信定数定義 ---
export const HID_CONSTANTS = {
  // HID デバイスの識別子
  USAGE_PAGE: 65376, // 0xFF60 (QMK/VIA Usage Page)
  USAGE: 97,         // 0x0061 (QMK/VIA Usage)

  // 通信制御
  WEB_HID_TIMEOUT_MS: 2000, // 通信応答のタイムアウト時間 (ミリ秒)

  // VIA/Vial コマンドID
  CMD_VIA_GET_PROTOCOL_VERSION: 0x01,
  CMD_DYNAMIC_KEYMAP_GET_KEYCODE: 0x04,
  CMD_VIA_GET_MACRO_BUFFER_SIZE: 0x0D,
  CMD_VIA_GET_MACRO_BUFFER: 0x0E,
  CMD_VIA_GET_LAYER_COUNT: 0x11,
  
  // Vial 拡張コマンド (0xFE プレフィックス)
  CMD_VIAL_PREFIX: 0xFE,
  CMD_VIAL_GET_KEYBOARD_ID: 0x00,
  CMD_VIAL_GET_ENCODER: 0x03,
  CMD_VIAL_GET_SIZE_INFO: 0x0D, // タップダンス数、コンボ数などの取得
  CMD_VIAL_TAP_DANCE_GET: 0x01,  // 個別のタップダンス設定を取得するサブコマンド (サイズ取得後に使用)
  CMD_VIAL_COMBO_GET: 0x03,      // 個別のコンボ設定を取得するサブコマンド
};

export interface PhysicalKeyDef {
  matrix_row: number;
  matrix_col: number;
  is_thumb?: boolean;
  is_encoder?: boolean;
}

export const LEFT_KEYS: PhysicalKeyDef[] = [
  // Row 0
  { matrix_row: 0, matrix_col: 0 },
  { matrix_row: 0, matrix_col: 1 },
  { matrix_row: 0, matrix_col: 2 },
  { matrix_row: 0, matrix_col: 3 },
  { matrix_row: 0, matrix_col: 4 },
  { matrix_row: 0, matrix_col: 5 },
  // Row 1
  { matrix_row: 1, matrix_col: 0 },
  { matrix_row: 1, matrix_col: 1 },
  { matrix_row: 1, matrix_col: 2 },
  { matrix_row: 1, matrix_col: 3 },
  { matrix_row: 1, matrix_col: 4 },
  { matrix_row: 1, matrix_col: 5 },
  // Row 2
  { matrix_row: 2, matrix_col: 0 },
  { matrix_row: 2, matrix_col: 1 },
  { matrix_row: 2, matrix_col: 2 },
  { matrix_row: 2, matrix_col: 3 },
  { matrix_row: 2, matrix_col: 4 },
  { matrix_row: 2, matrix_col: 5 },
  // Mouse 1 (Encoder)
  { matrix_row: 2, matrix_col: 6, is_thumb: true, is_encoder: true },
  // Thumbs
  { matrix_row: 3, matrix_col: 3, is_thumb: true },
  { matrix_row: 3, matrix_col: 4, is_thumb: true },
  { matrix_row: 3, matrix_col: 5, is_thumb: true },
  // Outer bottom corner keys
  { matrix_row: 3, matrix_col: 0 },
  { matrix_row: 3, matrix_col: 1 },
  { matrix_row: 3, matrix_col: 2 },
];

export const RIGHT_KEYS: PhysicalKeyDef[] = [
  // Row 0
  { matrix_row: 4, matrix_col: 0 },
  { matrix_row: 4, matrix_col: 1 },
  { matrix_row: 4, matrix_col: 2 },
  { matrix_row: 4, matrix_col: 3 },
  { matrix_row: 4, matrix_col: 4 },
  { matrix_row: 4, matrix_col: 5 },
  // Row 1
  { matrix_row: 5, matrix_col: 0 },
  { matrix_row: 5, matrix_col: 1 },
  { matrix_row: 5, matrix_col: 2 },
  { matrix_row: 5, matrix_col: 3 },
  { matrix_row: 5, matrix_col: 4 },
  { matrix_row: 5, matrix_col: 5 },
  // Row 2
  { matrix_row: 6, matrix_col: 0 },
  { matrix_row: 6, matrix_col: 1 },
  { matrix_row: 6, matrix_col: 2 },
  { matrix_row: 6, matrix_col: 3 },
  { matrix_row: 6, matrix_col: 4 },
  { matrix_row: 6, matrix_col: 5 },
  // Mute (Encoder)
  { matrix_row: 5, matrix_col: 6, is_thumb: true, is_encoder: true },
  // Thumbs
  { matrix_row: 7, matrix_col: 5, is_thumb: true },
  { matrix_row: 7, matrix_col: 4, is_thumb: true },
  { matrix_row: 7, matrix_col: 3, is_thumb: true },
  // Outer bottom corner keys
  { matrix_row: 7, matrix_col: 0 },
  { matrix_row: 7, matrix_col: 1 },
  { matrix_row: 7, matrix_col: 2 },
];

