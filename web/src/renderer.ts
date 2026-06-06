import { VialKeyboardData, KeyEntry, TapDanceEntry, MacroAction, LEFT_KEYS, RIGHT_KEYS, PhysicalKeyDef } from './types';
import { parseKeycode, translateSimple } from './keymap';

// レイヤー表示名定義
const LAYER_NAMES: Record<number, string> = {
  0: "Layer 0: BASE",
  1: "Layer 1: NUMPAD",
  2: "Layer 2: FN"
};

/**
 * キーキャップのX/Y座標および角度を取得します（Cornix / Corne 30-40% 物理レイアウト）
 */
function getKeyPosition(r: number, c: number, side: 'left' | 'right'): { x: number; y: number; angle: number } {
  // カラムスタッガ (縦のズレ) 定義
  const staggers: Record<number, number> = {
    0: 0.35,  // 小指外側 (Tab / Shift 等)
    1: 0.16,  // 小指 (Q, A, Z)
    2: 0.06,  // 薬指 (W, S, X)
    3: 0.00,  // 中指 (E, D, C)
    4: 0.10,  // 人差し指 (R, F, V)
    5: 0.30,  // 人差し指内側 (T, G, B)
    6: 0.35,  // ロータリーエンコーダー (中央側)
  };

  let rowEquiv = side === 'left' ? r : r - 4;
  let colEquiv = c;

  // ロータリーエンコーダースイッチの座標調整 ( matrix_col: 6 は行が異なっても行2に配置 )
  if (colEquiv === 6) {
    rowEquiv = 2;
  }

  // キー間のピッチを考慮した座標算出 (1.08倍の基準キーサイズ)
  let xUnits = colEquiv * 1.08;
  let yUnits = rowEquiv * 1.08 + (staggers[colEquiv] || 0);
  let angle = 0;

  // 親指キー (rowEquiv == 3) の扇形配置
  if (rowEquiv === 3) {
    let thumbIdx = -1;
    if (colEquiv === 3) thumbIdx = 0;
    else if (colEquiv === 4) thumbIdx = 1;
    else if (colEquiv === 5) thumbIdx = 2;

    if (thumbIdx === 0) {
      xUnits = 3.45;
      yUnits = 3.50;
      angle = 6;
    } else if (thumbIdx === 1) {
      xUnits = 4.50;
      yUnits = 3.56;
      angle = 12;
    } else if (thumbIdx === 2) {
      xUnits = 5.55;
      yUnits = 3.58;
      angle = 18;
    }
  }

  // 右手側は角度を反転
  if (side === 'right') {
    angle = -angle;
  }

  return { x: xUnits, y: yUnits, angle };
}

/**
 * 1つずつのキーキャップ HTML 文字列を組み立てます。
 */
function renderKeycap(
  layerIdx: number, 
  keyDef: PhysicalKeyDef, 
  side: 'left' | 'right', 
  layerLayout: KeyEntry[][], 
  tapDanceList: TapDanceEntry[],
  comboInputKeys: Set<string>
): string {
  const r = keyDef.matrix_row;
  const c = keyDef.matrix_col;
  const isThumb = !!keyDef.is_thumb;

  // セルの取得
  const entry = layerLayout[r]?.[c] || { raw: 'KC_NO', resolved: 'KC_NO', inheritedFrom: null };
  const rawKeycode = entry.raw;
  const resolvedKeycode = entry.resolved;
  const inheritedFrom = entry.inheritedFrom;

  const isInherited = inheritedFrom !== null;

  // キーコードのパース (表示用ラベル & カテゴリ取得)
  const parsed = parseKeycode(resolvedKeycode, tapDanceList);
  const mainLabel = parsed.mainLabel;
  const subLabel = parsed.subLabel;
  let category = parsed.category;

  // 物理キー自体が存在しない隙間(-1)または未割当(KC_NO)のスタイル処理
  if (rawKeycode === '-1' || rawKeycode === 'KC_NO' || rawKeycode === '') {
    category = 'transparent';
  }

  // 透過キー (KC_TRNS) だが、レイヤー0も含めて完全に解決できなかった場合の表示
  if (rawKeycode === 'KC_TRNS' && resolvedKeycode === 'KC_TRNS') {
    category = 'transparent';
  }

  // 座標と回転角度の取得
  const { x, y, angle } = getKeyPosition(r, c, side);
  const styleParts: string[] = [];
  if (side === 'left') {
    styleParts.push(`left: calc(${x.toFixed(3)} * var(--key-size))`);
  } else {
    styleParts.push(`right: calc(${x.toFixed(3)} * var(--key-size))`);
  }
  styleParts.push(`top: calc(${y.toFixed(3)} * var(--key-size))`);
  if (angle !== 0) {
    styleParts.push(`transform: rotate(${angle}deg)`);
  }
  const styleStr = styleParts.join('; ');

  const classes = ['key-cell'];
  if (isThumb) classes.push('thumb-key');

  const keycapClasses = ['keycap', `cat-${category}`];
  if (isInherited) keycapClasses.push('inherited');

  let innerHTML = '';

  // レイヤータップ(LT)やタップダンス(TD)のサブラベル配置
  if (subLabel) {
    if (subLabel.startsWith('LT')) {
      innerHTML += `<span class="top-sub-label">${subLabel}</span>`;
    } else {
      innerHTML += `<span class="sub-label">${subLabel}</span>`;
    }
  }

  // コンボキー（同時押しキー）であるかの判定
  const isComboKey = comboInputKeys.has(rawKeycode) || comboInputKeys.has(resolvedKeycode);
  if (isComboKey) {
    innerHTML += `<span class="combo-mark">†</span>`;
  }

  // 透過継承バッジ (どのレイヤーから降りてきたかを示す)
  if (isInherited) {
    innerHTML += `<span class="inherited-badge">L${inheritedFrom}</span>`;
  }

  // メインラベル内の改行を反映
  const displayLabel = mainLabel.replace(/\n/g, '<br>');
  innerHTML += `<span class="main-label">${displayLabel}</span>`;

  return `<div class="${classes.join(' ')}" style="${styleStr}"><div class="${keycapClasses.join(' ')}" data-layer="${layerIdx}" data-row="${r}" data-col="${c}">${innerHTML}</div></div>`;
}

/**
 * マクロアクションを人間が読める文字列に整形します。
 */
function formatMacroAction(action: MacroAction): string {
  switch (action.type) {
    case 'text':
      return `"${action.value}"`;
    case 'tap':
      return `${translateSimple(String(action.value))}`;
    case 'down':
      return `↓${translateSimple(String(action.value))}`;
    case 'up':
      return `↑${translateSimple(String(action.value))}`;
    case 'delay':
      return `Delay(${action.value}ms)`;
    default:
      return String(action.value);
  }
}

/**
 * レイヤーが完全に未設定（すべてのキーが KC_TRNS, KC_NO, -1 または空）であるか判定します。
 */
function isLayerEmpty(layerLayout: KeyEntry[][], layerEncoder?: KeyEntry[][]): boolean {
  if (!layerLayout) return true;
  for (let r = 0; r < layerLayout.length; r++) {
    const row = layerLayout[r];
    if (!row) continue;
    for (let c = 0; c < row.length; c++) {
      const entry = row[c];
      if (entry && entry.raw !== 'KC_TRNS' && entry.raw !== 'KC_NO' && entry.raw !== '-1' && entry.raw !== '') {
        return false;
      }
    }
  }

  if (layerEncoder) {
    for (let e = 0; e < layerEncoder.length; e++) {
      const enc = layerEncoder[e];
      if (!enc) continue;
      for (let dir = 0; dir < 2; dir++) {
        const entry = enc[dir];
        if (entry && entry.raw !== 'KC_TRNS' && entry.raw !== 'KC_NO' && entry.raw !== '') {
          return false;
        }
      }
    }
  }

  return true;
}

/**
 * 取得・パースされたキーボードデータをブラウザ画面に描画します。
 */
export function renderKeyboardData(data: VialKeyboardData): void {
  // 1. メインのシート部分を表示状態にする
  const sheetSection = document.getElementById('sheet-section');
  if (sheetSection) {
    sheetSection.style.display = 'block';
  }

  // 1.5. コンボの入力キーコードセットの収集
  const comboInputKeys = new Set<string>();
  data.combo.forEach(c => {
    c.inputs.forEach(inp => {
      if (inp && inp !== 'KC_NO') {
        comboInputKeys.add(inp);
      }
    });
  });

  // 2. キーマップレイアウトの描画 (動的レイヤー描画)
  const layoutContainer = document.getElementById('layout-container');
  if (layoutContainer) {
    layoutContainer.innerHTML = '';
    const layersCount = data.layout.length;
    const layersToRender = Array.from({ length: layersCount }, (_, i) => i);

    layersToRender.forEach(lIdx => {
      // レイヤー0以外で、中身が完全に空の場合は描画をスキップ
      if (lIdx !== 0 && isLayerEmpty(data.layout[lIdx], data.encoderLayout[lIdx])) {
        return;
      }

      const leftKeysHTML = LEFT_KEYS.map(k => renderKeycap(lIdx, k, 'left', data.layout[lIdx], data.tapDance, comboInputKeys)).join('');
      const rightKeysHTML = RIGHT_KEYS.map(k => renderKeycap(lIdx, k, 'right', data.layout[lIdx], data.tapDance, comboInputKeys)).join('');
      const layerTitle = LAYER_NAMES[lIdx] || `Layer ${lIdx}`;

      const layerSectionHTML = `
        <div class="layer-section">
          <h3 class="layer-title">${layerTitle}</h3>
          <div class="keyboard-layout">
            <div class="keyboard-half left-half">
              ${leftKeysHTML}
            </div>
            <div class="keyboard-half right-half">
              ${rightKeysHTML}
            </div>
          </div>
        </div>
      `;
      layoutContainer.insertAdjacentHTML('beforeend', layerSectionHTML);
    });
  }

  // 凡例を追加で挿入 (レイアウト下部に凡例を表示)
  const legendId = 'layout-legend';
  let legendEl = document.getElementById(legendId);
  if (!legendEl && sheetSection) {
    const legendHTML = `
      <div id="${legendId}" class="legend-section">
        <h4>凡例</h4>
        <div class="legend-grid">
          <div class="legend-item"><span class="legend-color cat-alphabet"></span> アルファベット / 記号</div>
          <div class="legend-item"><span class="legend-color cat-modifier"></span> 修飾キー (Shift/GUI/かな等)</div>
          <div class="legend-item"><span class="legend-color cat-layer"></span> レイヤー切替 (LT/TO/MO/TG)</div>
          <div class="legend-item"><span class="legend-color cat-nav"></span> ナビゲーション (Ent/BS/Tab/Esc)</div>
          <div class="legend-item"><span class="legend-color cat-custom"></span> カスタム (Macro/TD)</div>
          <div class="legend-item"><span class="legend-color cat-mouse"></span> マウス操作 (BTN/Wheel)</div>
          <div class="legend-item"><span class="legend-color cat-numpad"></span> テンキー / 四則演算</div>
          <div class="legend-item"><span class="legend-color cat-function"></span> ファンクション (F1-F12)</div>
          <div class="legend-item"><span class="legend-color cat-transparent" style="border: 1px dashed var(--border-color);"></span> 透過継承キー (下位の値を表示)</div>
          <div class="legend-item"><span style="color: #ef4444; font-weight: 700; font-size: 11px; margin-right: 6px;">†</span> 同時押し対象キー (Combo)</div>
        </div>
      </div>
    `;
    sheetSection.insertAdjacentHTML('beforeend', legendHTML);
  }

  // 3. アクティブなマクロの検出 (レイアウトやTDで使用されているマクロIDのみ表に表示)
  const usedMacros = new Set<number>();
  data.layout.forEach(layer => {
    layer.forEach(row => {
      row.forEach(cell => {
        const match = cell.raw.match(/^M(\d+)$/);
        if (match) usedMacros.add(parseInt(match[1], 10));
        
        // 解決済みキーも念のためスキャン
        const resMatch = cell.resolved.match(/^M(\d+)$/);
        if (resMatch) usedMacros.add(parseInt(resMatch[1], 10));
      });
    });
  });
  data.tapDance.forEach(td => {
    // 最初の4つのキーコード要素を走査
    for (let i = 0; i < 4; i++) {
      const val = td[i];
      if (typeof val === 'string') {
        const match = val.match(/^M(\d+)$/);
        if (match) usedMacros.add(parseInt(match[1], 10));
      }
    }
  });

  // 4. Tap Dance 表の描画
  const tdSection = document.getElementById('section-tap-dance');
  const tdTableBody = document.getElementById('table-tap-dance-body');
  if (tdSection && tdTableBody) {
    tdTableBody.innerHTML = '';
    
    // 設定が存在する最大のインデックスを調べる
    let maxConfigIdx = -1;
    data.tapDance.forEach((td, idx) => {
      if (td.slice(0, 4).some(k => k !== "KC_NO")) {
        maxConfigIdx = idx;
      }
    });

    if (maxConfigIdx >= 0) {
      tdSection.style.display = 'block';
      for (let i = 0; i <= maxConfigIdx; i++) {
        const td = data.tapDance[i];
        const tap = td[0];
        const hold = td[1];
        const doubleTap = td[2];
        const tripleTap = td[3];
        const term = td[4];

        const isEmpty = [tap, hold, doubleTap, tripleTap].every(k => k === "KC_NO");

        if (isEmpty) {
          tdTableBody.insertAdjacentHTML('beforeend', `
            <tr style="opacity: 0.35;">
              <td><strong>TD(${i})</strong></td>
              <td colspan="4" style="color: var(--text-color); font-style: italic;">（未設定）</td>
              <td>-</td>
            </tr>
          `);
        } else {
          const tapParsed = parseKeycode(tap, []);
          const holdParsed = parseKeycode(hold, []);
          const dtParsed = parseKeycode(doubleTap, []);
          const ttParsed = parseKeycode(tripleTap, []);

          const tapLabel = tap !== "KC_NO" ? `<span class="badge cat-${tapParsed.category}">${tapParsed.mainLabel}</span>` : "-";
          const holdLabel = hold !== "KC_NO" ? `<span class="badge cat-${holdParsed.category}">${holdParsed.mainLabel}</span>` : "-";
          const dtLabel = doubleTap !== "KC_NO" ? `<span class="badge cat-${dtParsed.category}">${dtParsed.mainLabel}</span>` : "-";
          const ttLabel = tripleTap !== "KC_NO" ? `<span class="badge cat-${ttParsed.category}">${ttParsed.mainLabel}</span>` : "-";

          tdTableBody.insertAdjacentHTML('beforeend', `
            <tr>
              <td><strong>TD(${i})</strong></td>
              <td>${tapLabel}</td>
              <td>${holdLabel}</td>
              <td>${dtLabel}</td>
              <td>${ttLabel}</td>
              <td><code>${term}ms</code></td>
            </tr>
          `);
        }
      }
    } else {
      tdSection.style.display = 'none';
    }
  }

  // 5. Combo (同時押し) 表の描画
  const comboSection = document.getElementById('section-combos');
  const comboTableBody = document.getElementById('table-combos-body');
  if (comboSection && comboTableBody) {
    comboTableBody.innerHTML = '';
    if (data.combo.length > 0) {
      comboSection.style.display = 'block';
      data.combo.forEach(c => {
        const inputBadges = c.inputs
          .filter((inp): inp is string => !!inp)
          .map(inp => {
            const parsed = parseKeycode(inp, data.tapDance);
            return `<span class="badge cat-${parsed.category}">${parsed.mainLabel}</span>`;
          })
          .join(" + ");

        const resParsed = parseKeycode(c.result, data.tapDance);
        const resultBadge = `<span class="badge cat-${resParsed.category}">${resParsed.mainLabel}</span>`;

        comboTableBody.insertAdjacentHTML('beforeend', `
          <tr>
            <td><strong>Combo(${c.index})</strong></td>
            <td>${inputBadges}</td>
            <td>${resultBadge}</td>
          </tr>
        `);
      });
    } else {
      comboSection.style.display = 'none';
    }
  }

  // 6. Macro 表の描画
  const macroSection = document.getElementById('section-macros');
  const macroTableBody = document.getElementById('table-macros-body');
  if (macroSection && macroTableBody) {
    macroTableBody.innerHTML = '';
    const activeMacroIndices = Array.from(usedMacros).sort((a, b) => a - b);

    if (activeMacroIndices.length > 0) {
      macroSection.style.display = 'block';
      activeMacroIndices.forEach(idx => {
        if (idx < data.macro.length) {
          const steps = data.macro[idx];
          const formatted = steps.map(formatMacroAction).join(" + ");
          
          let descText = "";
          if (idx === 0) {
            descText = `<span class="desc-text" style="color: var(--text-color); opacity: 0.7; font-size: 0.85rem; margin-left: 8px;">(括弧ペアを入力し、カーソルを1文字左に戻す)</span>`;
          }

          macroTableBody.insertAdjacentHTML('beforeend', `
            <tr>
              <td><strong>M${idx}</strong></td>
              <td><code>${formatted || "（空のマクロ）"}</code> ${descText}</td>
            </tr>
          `);
        }
      });
    } else {
      macroSection.style.display = 'none';
    }
  }

  // 7. Encoder 表の描画
  const encoderSection = document.getElementById('section-encoders');
  const encoderTableBody = document.getElementById('table-encoders-body');
  if (encoderSection && encoderTableBody) {
    encoderTableBody.innerHTML = '';
    const numLayers = data.encoderLayout.length;

    let hasVisibleEncoder = false;
    for (let l = 0; l < numLayers; l++) {
      // レイヤー0以外で、空レイヤーの場合はエンコーダー一覧からもスキップ
      if (l !== 0 && isLayerEmpty(data.layout[l], data.encoderLayout[l])) {
        continue;
      }
      hasVisibleEncoder = true;

      // 各エンコーダーCCW, CWキーの取得と装飾
      const e0ccw = data.encoderLayout[l][0]?.[0] || { raw: 'KC_NO', resolved: 'KC_NO', inheritedFrom: null };
      const e0cw = data.encoderLayout[l][0]?.[1] || { raw: 'KC_NO', resolved: 'KC_NO', inheritedFrom: null };
      const e1ccw = data.encoderLayout[l][1]?.[0] || { raw: 'KC_NO', resolved: 'KC_NO', inheritedFrom: null };
      const e1cw = data.encoderLayout[l][1]?.[1] || { raw: 'KC_NO', resolved: 'KC_NO', inheritedFrom: null };

      const formatEncCell = (entry: KeyEntry) => {
        const parsed = parseKeycode(entry.resolved, data.tapDance);
        const isInherited = entry.inheritedFrom !== null;
        const inheritedClass = isInherited ? 'class="inherited-enc"' : '';
        const inheritedBadge = isInherited ? `<span class="inherited-badge-enc">L${entry.inheritedFrom}</span>` : '';
        
        return `<span ${inheritedClass}>${parsed.mainLabel}</span> ${inheritedBadge}`;
      };

      encoderTableBody.insertAdjacentHTML('beforeend', `
        <tr>
          <td><strong>Layer ${l}</strong></td>
          <td>${formatEncCell(e0ccw)}</td>
          <td>${formatEncCell(e0cw)}</td>
          <td>${formatEncCell(e1ccw)}</td>
          <td>${formatEncCell(e1cw)}</td>
        </tr>
      `);
    }

    if (hasVisibleEncoder) {
      encoderSection.style.display = 'block';
    } else {
      encoderSection.style.display = 'none';
    }
  }
}
