import { VialKeyboardData, MacroAction, TapDanceEntry, HID_CONSTANTS, LEFT_KEYS, RIGHT_KEYS } from './types';
import { integerToKeycodeString, resolveKeymap, resolveEncoderLayout } from './keymap';

// WebHID API の型宣言 (TSの lib.dom に WebHID が含まれていない場合の対策)
declare global {
  interface Navigator {
    hid: {
      getDevices(): Promise<HIDDevice[]>;
      requestDevice(options: { filters: HIDDeviceFilter[] }): Promise<HIDDevice[]>;
      addEventListener(type: string, listener: EventListener): void;
      removeEventListener(type: string, listener: EventListener): void;
    };
  }

  interface HIDDevice {
    opened: boolean;
    productName?: string;
    collections: { usagePage: number; usage: number }[];
    open(): Promise<void>;
    close(): Promise<void>;
    sendReport(reportId: number, data: BufferSource): Promise<void>;
    addEventListener(type: 'inputreport', listener: (event: any) => void): void;
    removeEventListener(type: 'inputreport', listener: (event: any) => void): void;
  }

  interface HIDDeviceFilter {
    vendorId?: number;
    productId?: number;
    usagePage?: number;
    usage?: number;
  }
}

/**
 * QMK Raw HIDコマンドをデバイスに送信し、応答を Promise として返します (タイムアウト付き)。
 */
async function sendCommand(device: HIDDevice, cmdData: number[]): Promise<Uint8Array> {
  const payload = new Uint8Array(32);
  payload.set(cmdData.slice(0, 32));

  return new Promise<Uint8Array>((resolve, reject) => {
    let timeoutId: number | undefined;

    const handleReport = (event: any) => {
      // タイムアウト監視をクリア
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      device.removeEventListener('inputreport', handleReport);
      
      // レスポンスデータを返す (event.data は DataView)
      const buffer = new Uint8Array(event.data.buffer);
      resolve(buffer);
    };

    // レスポンス待ちのイベントリスナーを設定
    device.addEventListener('inputreport', handleReport);

    // タイムアウト処理
    timeoutId = setTimeout(() => {
      device.removeEventListener('inputreport', handleReport);
      const err = new Error("通信タイムアウト：キーボードから応答がないか、デバイスが切断されました。");
      err.name = "TimeoutError";
      reject(err);
    }, HID_CONSTANTS.WEB_HID_TIMEOUT_MS) as any;

    // コマンドの送信 (QMK raw HID は通常 reportId = 0 を使用)
    device.sendReport(0, payload).catch((err: any) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      device.removeEventListener('inputreport', handleReport);
      reject(err);
    });
  });
}

// モジュールレベルでデバイスをキャッシュし、2回目以降の接続を高速化・エラー防止する
let cachedDevice: HIDDevice | null = null;

/**
 * キャッシュされたデバイスとキャッシュをクリアし、接続をリセットします。
 */
export async function disconnectKeyboard(): Promise<void> {
  if (cachedDevice) {
    if (cachedDevice.opened) {
      try {
        await cachedDevice.close();
      } catch (_) { /* ignore */ }
    }
    cachedDevice = null;
  }
}

/**
 * WebHID API を用いて対応キーボードを探索し、接続を確立します。
 * 2回目以降はキャッシュされたデバイスをそのまま返します。
 */
export async function connectKeyboard(): Promise<HIDDevice> {
  const nav = navigator as any;
  if (!nav.hid) {
    const err = new Error("ブラウザが WebHID をサポートしていないか、安全なHTTPS接続ではありません。");
    err.name = "SecurityError";
    throw err;
  }

  // キャッシュ済みかつ開いているデバイスがあればそのまま返す
  if (cachedDevice && cachedDevice.opened) {
    return cachedDevice;
  }

  // キャッシュがあるが閉じている場合はクリアして再取得
  cachedDevice = null;

  let devices = await nav.hid.getDevices();
  // すでに許可されているデバイスから Cornix / Vial 互換品を探す
  let device = devices.find((d: HIDDevice) => 
    d.productName?.includes("Cornix") || 
    (d.collections && d.collections.some((c: any) => c.usagePage === HID_CONSTANTS.USAGE_PAGE && c.usage === HID_CONSTANTS.USAGE))
  );

  if (!device) {
    try {
      // ユーザーに選択ダイアログを表示
      const requestedDevices = await nav.hid.requestDevice({
        filters: [{
          usagePage: HID_CONSTANTS.USAGE_PAGE,
          usage: HID_CONSTANTS.USAGE
        }]
      });
      device = requestedDevices[0];
    } catch (e: any) {
      if (e.name === "NotAllowedError") {
        const err = new Error("キーボードへのアクセス権限が拒否されました。接続し直してください。");
        err.name = "NotAllowedError";
        throw err;
      }
      throw e;
    }
  }

  if (!device) {
    throw new Error("キーボードが見つかりませんでした。接続されているか確認してください。");
  }

  if (!device.opened) {
    await device.open();
  }

  // 成功したらキャッシュに保存
  cachedDevice = device;
  return device;
}

/**
 * マクロのバイト列を MacroAction にデコードします。
 */
function decodeMacroBytes(macroBytes: Uint8Array | number[]): MacroAction[] {
  const actions: MacroAction[] = [];
  let i = 0;
  const textAccum: string[] = [];

  const flushText = () => {
    if (textAccum.length > 0) {
      actions.push({ type: 'text', value: textAccum.join('') });
      textAccum.length = 0;
    }
  };

  while (i < macroBytes.length) {
    const b = macroBytes[i];
    if (b === 0) break;
    if (b === 1) {
      flushText();
      if (i + 1 < macroBytes.length) {
        const op = macroBytes[i + 1];
        if (op === 1 || op === 2 || op === 3) {
          const kcVal = macroBytes[i + 2];
          const kcStr = integerToKeycodeString(kcVal);
          const actName: 'tap' | 'down' | 'up' = op === 1 ? 'tap' : op === 2 ? 'down' : 'up';
          actions.push({ type: actName, value: kcStr });
          i += 3;
          continue;
        } else if (op === 4) {
          const digits: string[] = [];
          i += 2;
          while (i < macroBytes.length) {
            const charCode = macroBytes[i];
            const ch = String.fromCharCode(charCode);
            if (/\d/.test(ch)) {
              digits.push(ch);
              i++;
            } else {
              break;
            }
          }
          const ms = digits.length > 0 ? parseInt(digits.join(''), 10) : 0;
          actions.push({ type: 'delay', value: ms });
          continue;
        }
      }
      i++;
    } else {
      textAccum.push(String.fromCharCode(b));
      i++;
    }
  }
  
  flushText();
  return actions;
}

/**
 * 物理キーであるかどうか判定します。
 */
function isPhysicalKey(r: number, c: number): boolean {
  if (r < 4) {
    return LEFT_KEYS.some(k => k.matrix_row === r && k.matrix_col === c);
  } else {
    return RIGHT_KEYS.some(k => k.matrix_row === r && k.matrix_col === c);
  }
}

/**
 * 接続された WebHID デバイスから、Vialプロトコルに準拠してキーボード情報を取得・パースします。
 */
export async function readFromKeyboard(
  device: HIDDevice, 
  onProgress?: (progressText: string) => void
): Promise<VialKeyboardData> {
  let hasError = false;
  try {
    // 1. VIAプロトコルのバージョン確認
    if (onProgress) onProgress("VIAプロトコルバージョン取得中...");
    let res = await sendCommand(device, [HID_CONSTANTS.CMD_VIA_GET_PROTOCOL_VERSION]);
    const viaProto = res[2];
    if (!viaProto) {
      throw new Error("キーボードとの接続テストに失敗しました。非VIAキーボードの可能性があります。");
    }

    // 2. Vial バージョンおよびUIDの取得
    if (onProgress) onProgress("VialUID取得中...");
    res = await sendCommand(device, [HID_CONSTANTS.CMD_VIAL_PREFIX, HID_CONSTANTS.CMD_VIAL_GET_KEYBOARD_ID]);
    const vialProto = res[0];
    if (!vialProto) {
      throw new Error("Vialファームウェアとの通信に失敗しました。Vial対応キーボードではない可能性があります。");
    }

    // 3. 各種サイズ情報の取得 (タップダンス数、コンボ数)
    if (onProgress) onProgress("サイズ情報 (タップダンス・コンボ数) 取得中...");
    res = await sendCommand(device, [HID_CONSTANTS.CMD_VIAL_PREFIX, HID_CONSTANTS.CMD_VIAL_GET_SIZE_INFO, 0x00]);
    const tdCount = res[0];
    const comboCount = res[1];

    // 4. レイアウト情報 (10レイヤー × 8行 × 7列) の読み出し
    const layersCount = 10;
    const rowsCount = 8;
    const colsCount = 7;
    const rawLayout: (string | number)[][][] = [];

    for (let l = 0; l < layersCount; l++) {
      if (onProgress) onProgress(`キーマップ読み込み中: レイヤー ${l + 1}/${layersCount}...`);
      const layerRows: (string | number)[][] = [];
      for (let r = 0; r < rowsCount; r++) {
        const rowCols: (string | number)[] = [];
        for (let c = 0; c < colsCount; c++) {
          if (!isPhysicalKey(r, c)) {
            rowCols.push(-1);
            continue;
          }

          // DYNAMIC_KEYMAP_GET_KEYCODE コマンドの送信
          res = await sendCommand(device, [
            HID_CONSTANTS.CMD_DYNAMIC_KEYMAP_GET_KEYCODE,
            l,
            r,
            c
          ]);
          const kcVal = (res[4] << 8) | res[5];
          rowCols.push(integerToKeycodeString(kcVal));
        }
        layerRows.push(rowCols);
      }
      rawLayout.push(layerRows);
    }

    // 5. タップダンス設定の取得
    const tapDance: TapDanceEntry[] = [];
    for (let i = 0; i < tdCount; i++) {
      if (onProgress) onProgress(`タップダンス設定読み込み中: ${i + 1}/${tdCount}...`);
      res = await sendCommand(device, [
        HID_CONSTANTS.CMD_VIAL_PREFIX,
        HID_CONSTANTS.CMD_VIAL_GET_SIZE_INFO,
        HID_CONSTANTS.CMD_VIAL_TAP_DANCE_GET,
        i
      ]);
      const tapKc = (res[2] << 8) | res[1];
      const holdKc = (res[4] << 8) | res[3];
      const dtKc = (res[6] << 8) | res[5];
      const ttKc = (res[8] << 8) | res[7];
      const term = (res[10] << 8) | res[9];

      tapDance.push([
        integerToKeycodeString(tapKc),
        integerToKeycodeString(holdKc),
        integerToKeycodeString(dtKc),
        integerToKeycodeString(ttKc),
        term
      ]);
    }

    // 6. コンボ設定の取得
    const combo: VialKeyboardData["combo"] = [];
    for (let i = 0; i < comboCount; i++) {
      if (onProgress) onProgress(`コンボ設定読み込み中: ${i + 1}/${comboCount}...`);
      res = await sendCommand(device, [
        HID_CONSTANTS.CMD_VIAL_PREFIX,
        HID_CONSTANTS.CMD_VIAL_GET_SIZE_INFO,
        HID_CONSTANTS.CMD_VIAL_COMBO_GET,
        i
      ]);
      const in1 = (res[2] << 8) | res[1];
      const in2 = (res[4] << 8) | res[3];
      const in3 = (res[6] << 8) | res[5];
      const in4 = (res[8] << 8) | res[7];
      const out = (res[10] << 8) | res[9];

      const resultStr = integerToKeycodeString(out);
      if (resultStr && resultStr !== "KC_NO" && out !== 0xFFFF) {
        combo.push({
          index: i,
          inputs: [
            integerToKeycodeString(in1),
            integerToKeycodeString(in2),
            in3 && in3 !== 0 && in3 !== 0xFFFF ? integerToKeycodeString(in3) : undefined,
            in4 && in4 !== 0 && in4 !== 0xFFFF ? integerToKeycodeString(in4) : undefined,
          ],
          result: resultStr
        });
      }
    }

    // 7. マクロバッファの取得
    if (onProgress) onProgress("マクロ設定サイズ取得中...");
    res = await sendCommand(device, [HID_CONSTANTS.CMD_VIA_GET_MACRO_BUFFER_SIZE]);
    const macroSize = (res[1] << 8) | res[2];

    if (onProgress) onProgress(`マクロデータ読み込み中 (合計 ${macroSize} バイト)...`);
    const macroBytes: number[] = [];
    let offset = 0;
    while (offset < macroSize) {
      const chunkSize = Math.min(28, macroSize - offset);
      res = await sendCommand(device, [
        HID_CONSTANTS.CMD_VIA_GET_MACRO_BUFFER,
        (offset >> 8) & 0xFF,
        offset & 0xFF,
        chunkSize
      ]);
      // レスポンスの 4バイト目からデータが入る
      for (let i = 0; i < chunkSize; i++) {
        macroBytes.push(res[4 + i]);
      }
      offset += chunkSize;
    }

    // マクロのデコード (0で区切られたバイトシーケンス)
    const macro: MacroAction[][] = [];
    let currMacro: number[] = [];
    for (const b of macroBytes) {
      if (b === 0) {
        macro.push(decodeMacroBytes(currMacro));
        currMacro = [];
      } else {
        currMacro.push(b);
      }
    }
    // 未定義分を空配列で埋め、32個に固定する
    while (macro.length < 32) {
      macro.push([]);
    }

    // 8. ロータリーエンコーダーレイアウトの取得
    const rawEncoderLayout: (string | number)[][][] = [];
    for (let l = 0; l < layersCount; l++) {
      if (onProgress) onProgress(`エンコーダー設定読み込み中: レイヤー ${l + 1}/${layersCount}...`);
      const layerEncoders: string[][] = [];
      for (let e = 0; e < 2; e++) {
        res = await sendCommand(device, [
          HID_CONSTANTS.CMD_VIAL_PREFIX,
          HID_CONSTANTS.CMD_VIAL_GET_ENCODER,
          l,
          e
        ]);
        const ccw = (res[2] << 8) | res[1];
        const cw = (res[4] << 8) | res[3];
        layerEncoders.push([
          integerToKeycodeString(ccw),
          integerToKeycodeString(cw)
        ]);
      }
      rawEncoderLayout.push(layerEncoders);
    }

    // 9. 透過キー解決ユーティリティを呼んで完成
    if (onProgress) onProgress("キーレイアウト透過解決中...");
    const resolvedLayout = resolveKeymap(rawLayout);
    const resolvedEncoderLayout = resolveEncoderLayout(rawEncoderLayout);

    if (onProgress) onProgress("完了！");
    return {
      layout: resolvedLayout,
      tapDance,
      combo,
      macro,
      encoderLayout: resolvedEncoderLayout
    };
  } catch (err) {
    hasError = true;
    throw err;
  } finally {
    // エラー発生時のみ、接続をクローズしてキャッシュをクリアする（次回再接続できるようにリセット）
    if (hasError) {
      await disconnectKeyboard();
    }
  }
}
