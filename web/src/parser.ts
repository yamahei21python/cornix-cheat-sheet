import { VialKeyboardData, MacroAction, TapDanceEntry } from './types';
import { resolveKeymap, resolveEncoderLayout } from './keymap';

/**
 * アップロードされた .vil ファイル (JSON文字列) をパースし、
 * 透過解決済みの VialKeyboardData オブジェクトに変換します。
 */
export function parseVilContent(jsonText: string): VialKeyboardData {
  let parsed: any;
  try {
    parsed = JSON.parse(jsonText);
  } catch (e) {
    throw new Error("JSONのパースに失敗しました。正しい .vil ファイルファイルであることを確認してください。");
  }

  if (!parsed || !parsed.layout || !Array.isArray(parsed.layout)) {
    throw new Error("無効な .vil ファイルファイルです。layout フィールドが見つかりません。");
  }

  // 1. レイアウト生データのノーマライズと透過キー解決
  const rawLayout: (string | number)[][][] = [];
  for (let l = 0; l < parsed.layout.length; l++) {
    const layer = parsed.layout[l];
    const layerRows: (string | number)[][] = [];
    if (Array.isArray(layer)) {
      for (let r = 0; r < layer.length; r++) {
        const row = layer[r];
        const rowCols: (string | number)[] = [];
        if (Array.isArray(row)) {
          for (let c = 0; c < row.length; c++) {
            const cell = row[c];
            if (cell === -1 || cell === "-1") {
              rowCols.push(-1);
            } else if (typeof cell === "number") {
              // 数値のキーコードは文字列化して保持
              rowCols.push(String(cell));
            } else {
              rowCols.push(cell !== null && cell !== undefined ? String(cell) : "KC_NO");
            }
          }
        }
        layerRows.push(rowCols);
      }
    }
    rawLayout.push(layerRows);
  }

  const resolvedLayout = resolveKeymap(rawLayout);

  // 2. タップダンスデータの処理
  const tapDance: TapDanceEntry[] = [];
  if (Array.isArray(parsed.tap_dance)) {
    for (let i = 0; i < parsed.tap_dance.length; i++) {
      const td = parsed.tap_dance[i];
      if (Array.isArray(td) && td.length >= 5) {
        tapDance.push([
          String(td[0] || "KC_NO"),
          String(td[1] || "KC_NO"),
          String(td[2] || "KC_NO"),
          String(td[3] || "KC_NO"),
          typeof td[4] === "number" ? td[4] : parseInt(td[4], 10) || 0
        ]);
      }
    }
  }

  // 3. コンボデータの処理
  const combo: VialKeyboardData["combo"] = [];
  if (Array.isArray(parsed.combo)) {
    for (let i = 0; i < parsed.combo.length; i++) {
      const cData = parsed.combo[i];
      if (Array.isArray(cData) && cData.length >= 5) {
        const result = String(cData[4] || "KC_NO");
        if (result && result !== "KC_NO" && result !== "-1") {
          combo.push({
            index: i,
            inputs: [
              String(cData[0] || "KC_NO"),
              String(cData[1] || "KC_NO"),
              cData[2] && cData[2] !== "KC_NO" ? String(cData[2]) : undefined,
              cData[3] && cData[3] !== "KC_NO" ? String(cData[3]) : undefined,
            ],
            result
          });
        }
      }
    }
  }

  // 4. マクロデータの処理
  const macro: MacroAction[][] = [];
  if (Array.isArray(parsed.macro)) {
    for (let i = 0; i < parsed.macro.length; i++) {
      const macroSteps = parsed.macro[i];
      const actions: MacroAction[] = [];
      if (Array.isArray(macroSteps)) {
        for (let j = 0; j < macroSteps.length; j++) {
          const step = macroSteps[j];
          if (Array.isArray(step) && step.length >= 2) {
            const typeVal = step[0];
            const val = step[1];
            // typeのバリデーション
            let type: MacroAction['type'] = 'tap';
            if (['down', 'up', 'tap', 'delay', 'text'].includes(typeVal)) {
              type = typeVal as MacroAction['type'];
            }
            actions.push({
              type,
              value: type === 'delay' ? (typeof val === 'number' ? val : parseInt(val, 10) || 0) : String(val)
            });
          }
        }
      }
      macro.push(actions);
    }
  }

  // 5. エンコーダーレイアウトデータの処理
  const rawEncoderLayout: (string | number)[][][] = [];
  if (Array.isArray(parsed.encoder_layout)) {
    for (let l = 0; l < parsed.encoder_layout.length; l++) {
      const layerEncoders = parsed.encoder_layout[l];
      const layerRows: (string | number)[][] = [];
      if (Array.isArray(layerEncoders)) {
        for (let e = 0; e < layerEncoders.length; e++) {
          const enc = layerEncoders[e];
          if (Array.isArray(enc) && enc.length >= 2) {
            layerRows.push([String(enc[0] || "KC_NO"), String(enc[1] || "KC_NO")]);
          } else {
            layerRows.push(["KC_NO", "KC_NO"]);
          }
        }
      }
      rawEncoderLayout.push(layerRows);
    }
  }

  // エンコーダー配列が空か無効な場合のフォールバック（レイヤー数に合わせて初期化）
  if (rawEncoderLayout.length === 0) {
    for (let l = 0; l < resolvedLayout.length; l++) {
      rawEncoderLayout.push([["KC_NO", "KC_NO"], ["KC_NO", "KC_NO"]]);
    }
  }

  const resolvedEncoderLayout = resolveEncoderLayout(rawEncoderLayout);

  return {
    layout: resolvedLayout,
    tapDance,
    combo,
    macro,
    encoderLayout: resolvedEncoderLayout
  };
}
