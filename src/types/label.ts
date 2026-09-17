/**
 * Shared label element types, document definitions, and print contracts.
 */

export type BarcodeType = 'CODE128' | 'CODE39' | 'EAN13' | 'EAN8' | 'UPC-A' | 'ITF' | 'CODABAR';
export type QRErrorCorrection = 'L' | 'M' | 'Q' | 'H';
export type FontSize = '1' | '2' | '3' | '4' | '5';

export interface BaseElement {
  id: string;
  x: number; // mm from left
  y: number; // mm from top
  rotation: number; // degrees (0, 90, 180, 270)
}

export interface TextElement extends BaseElement {
  type: 'text';
  content: string;
  fontSize: FontSize;
  bold: boolean;
  width: number; // mm
  height: number; // mm
}

export interface BarcodeElement extends BaseElement {
  type: 'barcode';
  content: string;
  barcodeType: BarcodeType;
  width: number; // mm
  height: number; // mm
  showText: boolean;
}

export interface QRCodeElement extends BaseElement {
  type: 'qrcode';
  content: string;
  size: number; // mm
  errorCorrection: QRErrorCorrection;
}

export interface LineElement extends BaseElement {
  type: 'line';
  width: number; // mm
  thickness: number; // px thickness (1–10)
}

export interface BoxElement extends BaseElement {
  type: 'box';
  width: number; // mm
  height: number; // mm
  thickness: number; // dot thickness
}

export type LabelElement =
  | TextElement
  | BarcodeElement
  | QRCodeElement
  | LineElement
  | BoxElement;

export interface LabelSize {
  name: string;
  width: number;  // mm
  height: number; // mm
}

export interface LabelDocument {
  size: LabelSize;
  elements: LabelElement[];
}

export interface PrintOptions {
  copies?: number;
  density?: number; // 1-15
  speed?: number;   // 2-5
  paperType?: 'gap' | 'continuous' | 'black';
}

export type PrintTarget =
  | { type: 'serial'; portName: string; baudRate?: number }
  | { type: 'spooler'; printerName: string }
  | { type: 'tcp'; ip: string; port: number };

export interface PrintJobDetail {
  id: number;
  document_name: string;
  status: string;
  size_bytes: number;
}

export interface PrinterDiagnostic {
  reachable: boolean;
  jobCount: number;
  statusText: string;
  error?: string;
}

export interface UnifiedPrinterDevice {
  id: string;
  name: string;
  detail: string;
  deviceType: 'serial' | 'spooler' | 'tcp';
  isLikelyPrinter: boolean;
  portName?: string;
  printerName?: string;
  baudRate?: number;
  jobCount?: number;
  isRecommended?: boolean;
  category?: 'thermal' | 'system';
  status?: 'ready' | 'stuck' | 'offline' | 'unknown';
}

export interface LabelTemplate {
  id: string;
  name: string;
  category: 'shipping' | 'retail' | 'inventory' | 'warning' | 'office' | 'medical' | 'food';
  description: string;
  size: LabelSize;
  elements: LabelElement[];
}

export const PRESET_LABEL_SIZES: LabelSize[] = [
  { name: '58×40mm (Retail / Barcode)', width: 58, height: 40 },
  { name: '40×30mm (Jewelry / Price)', width: 40, height: 30 },
  { name: '80×50mm (Medium / Storage)', width: 80, height: 50 },
  { name: '80×60mm (Warehouse Box)', width: 80, height: 60 },
  { name: '100×75mm (Large Product)', width: 100, height: 75 },
  { name: '101.6×152.4mm (4"×6" Shipping)', width: 101.6, height: 152.4 },
  { name: 'Custom', width: 80, height: 60 },
];

/** Pixels per mm at the canvas preview scale (203 DPI / 25.4 mm = 7.99 ≈ 8 px/mm) */
export const PX_PER_MM = 4;
