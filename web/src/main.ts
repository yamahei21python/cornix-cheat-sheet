import { parseVilContent } from './parser';
import { connectKeyboard, readFromKeyboard } from './webhid';
import { renderKeyboardData } from './renderer';
import { VialKeyboardData } from './types';
import { translateSimple } from './keymap';

// 現在読み込まれているキーボード設定データ
let currentKeyboardData: VialKeyboardData | null = null;

// --- UI Elements ---
const dropZone = document.getElementById('drop-zone') as HTMLDivElement | null;
const fileInput = document.getElementById('file-input') as HTMLInputElement | null;
const btnConnect = document.getElementById('btn-connect') as HTMLButtonElement | null;
const btnPrint = document.getElementById('btn-print') as HTMLButtonElement | null;
const browserWarning = document.getElementById('browser-warning') as HTMLParagraphElement | null;
const statusCard = document.getElementById('status-card') as HTMLDivElement | null;
const statusMessage = document.getElementById('status-message') as HTMLSpanElement | null;
const statusSpinner = document.getElementById('status-spinner') as HTMLSpanElement | null;
const sheetKeyboardName = document.getElementById('sheet-keyboard-name') as HTMLHeadingElement | null;
const sheetMetaInfo = document.getElementById('sheet-meta-info') as HTMLParagraphElement | null;

/**
 * ステータス表示を更新します
 */
function updateStatus(message: string, showSpinner = false, isError = false) {
  if (!statusCard || !statusMessage || !statusSpinner) return;

  statusCard.style.display = 'block';
  statusMessage.textContent = message;
  
  if (showSpinner) {
    statusSpinner.style.display = 'inline-block';
  } else {
    statusSpinner.style.display = 'none';
  }

  if (isError) {
    statusCard.style.borderColor = 'rgba(244, 63, 94, 0.4)';
    statusCard.style.background = 'rgba(244, 63, 94, 0.1)';
    statusMessage.style.color = '#f43f5e';
  } else {
    statusCard.style.borderColor = 'rgba(255, 255, 255, 0.08)';
    statusCard.style.background = 'rgba(17, 24, 39, 0.65)';
    statusMessage.style.color = '#f1f5f9';
  }
}

/**
 * ステータス表示を非表示にします
 */
function hideStatus() {
  if (statusCard) {
    statusCard.style.display = 'none';
  }
}

/**
 * ファイル解析処理を実行
 */
function handleFile(file: File) {
  if (!file) return;

  updateStatus(`${file.name} を解析中...`, true);

  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target?.result;
    if (typeof text === 'string') {
      try {
        const keyboardData = parseVilContent(text);
        
        // メタデータの表示更新
        if (sheetKeyboardName) {
          sheetKeyboardName.textContent = "Cornix Keyboard Layout";
        }
        if (sheetMetaInfo) {
          const formattedDate = new Date().toLocaleString('ja-JP', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
          });
          sheetMetaInfo.textContent = `ソース: ファイルアップロード (${file.name}) | 生成日時: ${formattedDate}`;
        }

        currentKeyboardData = keyboardData;
        renderKeyboardData(keyboardData);
        hideStatus();
      } catch (err: any) {
        updateStatus(`解析エラー: ${err.message}`, false, true);
      }
    }
  };
  reader.onerror = () => {
    updateStatus("ファイルの読み込みに失敗しました。", false, true);
  };
  reader.readAsText(file);
}

// --- イベントリスナー設定 ---

// 1. ブラウザ互換性チェック (WebHID)
const nav = navigator as any;
if (!nav.hid && browserWarning && btnConnect) {
  browserWarning.style.display = 'block';
  btnConnect.disabled = true;
  btnConnect.style.opacity = '0.5';
  btnConnect.style.cursor = 'not-allowed';
}

// 2. ドラッグ＆ドロップファイル入力
if (dropZone && fileInput) {
  dropZone.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files && fileInput.files.length > 0) {
      handleFile(fileInput.files[0]);
    }
  });

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  });
}

// 3. WebHID キーボード接続
if (btnConnect) {
  btnConnect.addEventListener('click', async () => {
    try {
      btnConnect.disabled = true;
      updateStatus("キーボードへの接続を要求中...", true);
      const device = await connectKeyboard();
      
      // キーボードからデータ取得
      const keyboardData = await readFromKeyboard(device, (progress) => {
        updateStatus(progress, true);
      });

      // メタデータの表示更新
      if (sheetKeyboardName) {
        sheetKeyboardName.textContent = device.productName || "Cornix Keyboard";
      }
      if (sheetMetaInfo) {
        const formattedDate = new Date().toLocaleString('ja-JP', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        });
        sheetMetaInfo.textContent = `ソース: キーボード直接取得 (USB WebHID) | 生成日時: ${formattedDate}`;
      }

      currentKeyboardData = keyboardData;
      renderKeyboardData(keyboardData);
      hideStatus();
    } catch (err: any) {
      console.error(err);
      
      // エラーの分類別メッセージ
      let errorMsg = err.message;
      if (err.name === 'NotAllowedError') {
        errorMsg = "キーボードへのアクセス権限が拒否されました。接続し直してください。";
      } else if (err.name === 'SecurityError') {
        errorMsg = "ブラウザが WebHID をサポートしていないか、安全なHTTPS接続ではありません。";
      } else if (err.name === 'TimeoutError') {
        errorMsg = "通信タイムアウト：キーボードから応答がないか、デバイスが切断されました。";
      }
      
      updateStatus(errorMsg, false, true);
    } finally {
      btnConnect.disabled = false;
    }
  });
}

// 4. 印刷実行
if (btnPrint) {
  btnPrint.addEventListener('click', () => {
    window.print();
  });
}

// 5. ツールチップ (詳細ポップアップ) の初期化とインタラクション
const tooltip = document.createElement('div');
tooltip.className = 'tooltip no-print';
tooltip.style.display = 'none';
document.body.appendChild(tooltip);

function hideTooltip() {
  tooltip.style.display = 'none';
}

// キーキャップをクリックした時のツールチップ表示制御
document.getElementById('layout-container')?.addEventListener('click', (e) => {
  const target = e.target as HTMLElement;
  const keycap = target.closest('.keycap') as HTMLElement;
  if (!keycap) {
    hideTooltip();
    return;
  }

  const layerAttr = keycap.getAttribute('data-layer');
  const rowAttr = keycap.getAttribute('data-row');
  const colAttr = keycap.getAttribute('data-col');
  if (!layerAttr || !rowAttr || !colAttr || !currentKeyboardData) {
    hideTooltip();
    return;
  }

  const layer = parseInt(layerAttr, 10);
  const row = parseInt(rowAttr, 10);
  const col = parseInt(colAttr, 10);
  const entry = currentKeyboardData.layout[layer]?.[row]?.[col];
  if (!entry) {
    hideTooltip();
    return;
  }

  const raw = entry.raw;
  const resolved = entry.resolved;
  const inheritedFrom = entry.inheritedFrom;

  let tooltipHTML = '';
  let hasDetails = false;

  // 1. タップダンスキー (TD) の場合
  const tdMatch = resolved.match(/^TD\((\d+)\)$/);
  if (tdMatch) {
    const tdIdx = parseInt(tdMatch[1], 10);
    const td = currentKeyboardData.tapDance[tdIdx];
    if (td) {
      hasDetails = true;
      const formatTDAction = (act: string) => {
        if (act === "KC_NO" || act === "") return '<span style="color: #64748b; font-style: italic;">なし</span>';
        return `<code>${act}</code>`;
      };
      tooltipHTML = `
        <h4>Tap Dance <span class="tooltip-title-badge">TD(${tdIdx})</span></h4>
        <div class="tooltip-body">
          <div class="tooltip-row"><span class="tooltip-label">Tap:</span><span class="tooltip-value">${formatTDAction(td[0])}</span></div>
          <div class="tooltip-row"><span class="tooltip-label">Hold:</span><span class="tooltip-value">${formatTDAction(td[1])}</span></div>
          <div class="tooltip-row"><span class="tooltip-label">Double Tap:</span><span class="tooltip-value">${formatTDAction(td[2])}</span></div>
          <div class="tooltip-row"><span class="tooltip-label">Triple Tap:</span><span class="tooltip-value">${formatTDAction(td[3])}</span></div>
          <div class="tooltip-row"><span class="tooltip-label">期限 (Term):</span><span class="tooltip-value"><code>${td[4]}ms</code></span></div>
          {combo_info}
        </div>
      `;
    }
  }

  // 2. マクロキー (M) の場合
  if (!hasDetails) {
    const macroMatch = resolved.match(/^M(\d+)$/);
    if (macroMatch) {
      const mIdx = parseInt(macroMatch[1], 10);
      const steps = currentKeyboardData.macro[mIdx];
      if (steps) {
        hasDetails = true;
        const formatMacroAction = (act: any) => {
          if (act.type === 'text') return `"${act.value}"`;
          if (act.type === 'delay') return `${act.value}ms`;
          return `${act.type === 'down' ? '↓' : act.type === 'up' ? '↑' : ''}${translateSimple(String(act.value))}`;
        };
        const formatted = steps.map(formatMacroAction).join(" ➔ ") || "（空のマクロ）";
        tooltipHTML = `
          <h4>Macro <span class="tooltip-title-badge">M(${mIdx})</span></h4>
          <div class="tooltip-body">
            <div class="tooltip-row"><span class="tooltip-label">動作内容:</span></div>
            <div class="tooltip-value" style="text-align: left; margin-top: 4px; line-height: 1.6;"><code>${formatted}</code></div>
            {combo_info}
          </div>
        `;
      }
    }
  }

  // 3. レイヤータップ (LT) の場合
  if (!hasDetails) {
    const ltMatch = resolved.match(/^LT(\d+)\((.+)\)$/);
    if (ltMatch) {
      hasDetails = true;
      const destLayer = ltMatch[1];
      const tapKey = ltMatch[2];
      tooltipHTML = `
        <h4>Layer Tap <span class="tooltip-title-badge">LT${destLayer}</span></h4>
        <div class="tooltip-body">
          <div class="tooltip-row"><span class="tooltip-label">Tap (単押し):</span><span class="tooltip-value"><code>${tapKey}</code></span></div>
          <div class="tooltip-row"><span class="tooltip-label">Hold (長押し):</span><span class="tooltip-value">レイヤー ${destLayer} へ切替</span></div>
          {combo_info}
        </div>
      `;
    }
  }

  // 4. その他のキー (透過キーや通常キー詳細)
  if (!hasDetails) {
    hasDetails = true;
    const inheritedInfo = inheritedFrom !== null
      ? `<div class="tooltip-row"><span class="tooltip-label">継承元:</span><span class="tooltip-value">Layer ${inheritedFrom}</span></div>`
      : '';
    tooltipHTML = `
      <h4>Key Details</h4>
      <div class="tooltip-body">
        <div class="tooltip-row"><span class="tooltip-label">キーコード:</span><span class="tooltip-value"><code>${raw}</code></span></div>
        ${inheritedInfo}
        <div class="tooltip-row"><span class="tooltip-label">解決値:</span><span class="tooltip-value"><code>${resolved}</code></span></div>
        {combo_info}
      </div>
    `;
  }

  if (hasDetails) {
    // 関連コンボ情報の検索とHTML組み立て
    let comboInfoHTML = '';
    if (currentKeyboardData && (raw || resolved)) {
      const associatedCombos = currentKeyboardData.combo.filter(c => {
        return c.inputs.some(inp => inp === raw || inp === resolved);
      });

      if (associatedCombos.length > 0) {
        const comboRowsHTML = associatedCombos.map(c => {
          const inputsStr = c.inputs
            .filter((inp): inp is string => !!inp)
            .map(inp => translateSimple(inp))
            .join(' + ');
          const resultStr = translateSimple(c.result);
          return `
            <div class="tooltip-row" style="font-size: 0.7rem; color: #a7f3d0; margin-top: 3px; display: flex; justify-content: space-between; gap: 8px;">
              <span class="tooltip-label" style="color: #34d399; font-size: 0.7rem; white-space: nowrap;">Combo(${c.index}):</span>
              <span class="tooltip-value" style="color: #cbd5e1; font-size: 0.7rem; text-align: right; word-break: break-all;">${inputsStr} ➔ <code>${resultStr}</code></span>
            </div>
          `;
        }).join('');

        comboInfoHTML = `
          <div class="tooltip-combo-section" style="margin-top: 8px; border-top: 1px dashed rgba(255, 255, 255, 0.15); padding-top: 6px;">
            <span class="tooltip-label" style="font-weight: 700; color: #34d399; font-size: 0.75rem;">関連コンボ:</span>
            ${comboRowsHTML}
          </div>
        `;
      }
    }

    // プレースホルダーを実際のコンボ情報HTMLに置換（ない場合は空文字）
    tooltipHTML = tooltipHTML.replace('{combo_info}', comboInfoHTML);

    tooltip.innerHTML = tooltipHTML;
    tooltip.style.display = 'block';

    // ツールチップの座標設定 (キーキャップの中央上部)
    const rect = keycap.getBoundingClientRect();
    tooltip.style.left = `${rect.left + window.scrollX + rect.width / 2}px`;
    tooltip.style.top = `${rect.top + window.scrollY - 8}px`;
    tooltip.style.transform = 'translate(-50%, -100%)';

    e.stopPropagation(); // documentのclickイベントへ伝播させて即座に閉じるのを防ぐ
  } else {
    hideTooltip();
  }
});

// 画面のキー以外の場所をクリックした時にポップアップを閉じる
document.addEventListener('click', () => {
  hideTooltip();
});
