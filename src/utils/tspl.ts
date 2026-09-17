import { LabelElement, LabelSize } from '../types/label';

/** Converts mm to printer dots at 203 DPI (8 dots/mm) */
const mmToDots = (mm: number): number => Math.round(mm * 8);

/**
 * Generates a TSPL (Taiwan Semiconductor Printer Language) string for a
 * label document and returns it as a Base64-encoded string suitable for
 * `invoke('print_tcp', { data })`.
 */
export function generateTsplBase64(
  elements: LabelElement[],
  size: LabelSize,
  copies: number = 1,
  paperType: 'gap' | 'black' | 'cont' = 'gap'
): string {
  let tspl = '';

  // 1. Initialize Label Size and Gap
  tspl += `SIZE ${size.width} mm,${size.height} mm\r\n`;
  if (paperType === 'cont') {
    tspl += `GAP 0 mm,0 mm\r\n`;
  } else if (paperType === 'black') {
    tspl += `BLINE 2 mm,0 mm\r\n`;
  } else {
    tspl += `GAP 2 mm,0 mm\r\n`;
  }
  tspl += `DIRECTION 0,0\r\n`;
  tspl += `REFERENCE 0,0\r\n`;
  tspl += `CLS\r\n`;

  // 2. Iterate elements and draw using absolute X/Y dot coordinates
  for (const el of elements) {
    const xDots = mmToDots(el.x);
    const yDots = mmToDots(el.y);

    if (el.type === 'text') {
      const sizeInt = parseInt(el.fontSize) || 2;
      let multiplier = 1;
      if (sizeInt >= 2 && sizeInt < 4) multiplier = 2;
      if (sizeInt >= 4) multiplier = 3;
      const font = '3';
      tspl += `TEXT ${xDots},${yDots},"${font}",${el.rotation ?? 0},${multiplier},${multiplier},"${el.content}"\r\n`;
    }
    else if (el.type === 'barcode') {
      const human = el.showText ? 1 : 0;
      const heightDots = mmToDots(el.height);
      const narrow = Math.max(1, Math.min(10, Math.round(el.height / 6)));
      const wide = narrow * 2;
      // Map friendly type names to TSPL barcode type strings
      const tsplTypeMap: Record<string, string> = {
        'CODE128': '128',
        'CODE39': '39',
        'EAN13': 'EAN13',
        'EAN8': 'EAN8',
        'UPC-A': 'UPCA',
        'ITF': 'ITF25',
        'CODABAR': 'CODABAR',
      };
      const bType = tsplTypeMap[el.barcodeType] ?? '128';
      tspl += `BARCODE ${xDots},${yDots},"${bType}",${heightDots},${human},${el.rotation ?? 0},${narrow},${wide},"${el.content}"\r\n`;
    }
    else if (el.type === 'qrcode') {
      const cellWidth = Math.max(2, Math.min(10, Math.round(el.size / 20)));
      const eccLevel = el.errorCorrection ?? 'M';
      tspl += `QRCODE ${xDots},${yDots},${eccLevel},${cellWidth},A,${el.rotation ?? 0},"${el.content}"\r\n`;
    }
    else if (el.type === 'line') {
      tspl += `BAR ${xDots},${yDots},${mmToDots(el.width)},${Math.max(2, el.thickness * 2)}\r\n`;
    }
    else if (el.type === 'box') {
      tspl += `BOX ${xDots},${yDots},${xDots + mmToDots(el.width)},${yDots + mmToDots(el.height)},${Math.max(2, el.thickness * 2)}\r\n`;
    }
  }

  // 3. Print command
  tspl += `PRINT ${copies},1\r\n`;

  // 4. Encode to Base64
  const encoded = new TextEncoder().encode(tspl);
  let binary = '';
  for (let i = 0; i < encoded.byteLength; i++) {
    binary += String.fromCharCode(encoded[i]);
  }
  return btoa(binary);
}

// ─── Legacy TsplCommandBuilder (kept for backward compat) ───────────────────

export class TsplCommandBuilder {
  private buffer: number[] = [];
  private encoder: TextEncoder = new TextEncoder();

  private append(data: string | Uint8Array) {
    if (typeof data === 'string') {
      const encoded = this.encoder.encode(data);
      for (const byte of encoded) this.buffer.push(byte);
    } else {
      for (const byte of data) this.buffer.push(byte);
    }
  }

  size(width: number, height: number): this {
    this.append(`SIZE ${width} mm, ${height} mm\r\n`);
    return this;
  }

  gap(length: number, offset: number = 0): this {
    this.append(`GAP ${length} mm, ${offset} mm\r\n`);
    return this;
  }

  speed(speed: number): this {
    this.append(`SPEED ${speed}\r\n`);
    return this;
  }

  density(density: number): this {
    this.append(`DENSITY ${density}\r\n`);
    return this;
  }

  clear(): this {
    this.append(`CLS\r\n`);
    return this;
  }

  print(sets: number = 1, copies: number = 1): this {
    this.append(`PRINT ${sets}, ${copies}\r\n`);
    return this;
  }

  text(x: number, y: number, font: string, rotation: number, xMultiplier: number, yMultiplier: number, text: string): this {
    this.append(`TEXT ${x},${y},"${font}",${rotation},${xMultiplier},${yMultiplier},"${text}"\r\n`);
    return this;
  }

  barcode(x: number, y: number, type: string, height: number, humanReadable: 0 | 1 | 2 | 3, rotation: number, narrow: number, wide: number, content: string): this {
    this.append(`BARCODE ${x},${y},"${type}",${height},${humanReadable},${rotation},${narrow},${wide},"${content}"\r\n`);
    return this;
  }

  qrcode(x: number, y: number, eccLevel: 'L' | 'M' | 'Q' | 'H', cellWidth: number, mode: 'A' | 'M', rotation: number, content: string): this {
    this.append(`QRCODE ${x},${y},${eccLevel},${cellWidth},${mode},${rotation},"${content}"\r\n`);
    return this;
  }

  build(): Uint8Array {
    return new Uint8Array(this.buffer);
  }

  buildBase64(): string {
    const bytes = this.build();
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
}
