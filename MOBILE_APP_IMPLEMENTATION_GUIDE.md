# Bravon Mobile App (Expo / React Native) — Label Printing & Templates Implementation Guide

> **Target Platform:** React Native (Expo SDK 51+) / iOS & Android  
> **Hardware Target:** Thermal Label Printers (ZJiang ZJ-9200, ZJ-9210, D100, POS-58, POS-80, TSC/TSPL compatible)  
> **Source of Truth:** Ported directly from the verified Bravon Desktop App (`bravon-print-desktop`).

---

## 1. Architectural Overview & Shared Philosophy

### The "Unified Document" Paradigm
Both Desktop and Mobile use **millimeter-based coordinates (mm)** and render thermal labels at **203 DPI (8 dots/mm)**:
- Never store raw device coordinates or screen pixels in templates. Store mm dimensions.
- On screen: calculate `scale = previewWidthPx / documentWidthMm` for WYSIWYG preview.
- To printer: calculate `dots = Math.round(mm * 8)` for TSPL byte generation.

```
┌────────────────────────────────────────────────────────┐
│               JSON LabelDocument (in mm)               │
│      (Shared schema across Desktop and Mobile App)     │
└──────────────────────────┬─────────────────────────────┘
                           │
             ┌─────────────┴─────────────┐
             ▼                           ▼
┌─────────────────────────┐ ┌─────────────────────────┐
│     Mobile Preview      │ │     TSPL-II Engine      │
│  (React Native / SVG)   │ │  (Pure TS -> Byte Array)│
│   Scale: Screen Width   │ │   Scale: 8 dots/mm      │
└─────────────────────────┘ └────────────┬────────────┘
                                         ▼
                            ┌─────────────────────────┐
                            │    Bluetooth SPP / BLE  │
                            │   Chunked Buffer Stream │
                            └─────────────────────────┘
```

---

## 2. Core TypeScript Types (`types/label.ts`)

Copy this file directly into your Expo project at `src/types/label.ts`:

```typescript
export const DPI = 203;
export const DOTS_PER_MM = 8; // 203 DPI / 25.4 mm ≈ 8 dots/mm

export type ElementType = 'text' | 'barcode' | 'qrcode' | 'line' | 'box';
export type BarcodeType = 'CODE128' | 'CODE39' | 'EAN13' | 'EAN8' | 'UPC-A' | 'ITF' | 'CODABAR';
export type FontSize = '1' | '2' | '3' | '4' | '5';

export interface BaseElement {
  id: string;
  type: ElementType;
  x: number; // mm from left
  y: number; // mm from top
  rotation?: number; // 0, 90, 180, 270
}

export interface TextElement extends BaseElement {
  type: 'text';
  content: string;
  fontSize: FontSize;
  bold?: boolean;
  width?: number; // mm
  height?: number; // mm
}

export interface BarcodeElement extends BaseElement {
  type: 'barcode';
  content: string;
  barcodeType: BarcodeType;
  width?: number; // mm
  height: number; // mm
  showText?: boolean;
}

export interface QRCodeElement extends BaseElement {
  type: 'qrcode';
  content: string;
  size: number; // mm (width = height)
  errorCorrection?: 'L' | 'M' | 'Q' | 'H';
}

export interface LineElement extends BaseElement {
  type: 'line';
  width: number; // mm
  thickness?: number; // dot thickness (default 2)
}

export interface BoxElement extends BaseElement {
  type: 'box';
  width: number; // mm
  height: number; // mm
  thickness?: number; // border thickness (default 2)
}

export type LabelElement = TextElement | BarcodeElement | QRCodeElement | LineElement | BoxElement;

export interface LabelSize {
  name: string;
  width: number; // mm
  height: number; // mm
}

export interface LabelDocument {
  size: LabelSize;
  elements: LabelElement[];
}

export interface PrintOptions {
  copies?: number;
  density?: number; // 1 to 15 (thermal darkness)
  speed?: number; // 2 to 5 inches/sec
  paperType?: 'gap' | 'continuous' | 'black';
}

export interface LabelTemplate {
  id: string;
  name: string;
  category: 'shipping' | 'retail' | 'inventory' | 'warning' | 'office' | 'medical' | 'food';
  description: string;
  size: LabelSize;
  elements: LabelElement[];
}
```

---

## 3. The 12 Production Templates (`data/templates.ts`)

Copy this directly into `src/data/templates.ts`:

```typescript
import { LabelTemplate } from '../types/label';

export const LABEL_TEMPLATES: LabelTemplate[] = [
  // ─── 1. Retail SKU & Barcode ─────────────────────────────────────────────
  {
    id: 'retail-barcode-58x40',
    name: 'Retail SKU & Barcode',
    category: 'retail',
    description: 'Clean retail product tag with product name, SKU barcode, and price.',
    size: { name: '58×40mm (Retail / Barcode)', width: 58, height: 40 },
    elements: [
      { id: 't1', type: 'text', x: 4, y: 3, content: 'ORGANIC COFFEE BEANS', fontSize: '3', bold: true, width: 50, height: 5 },
      { id: 't2', type: 'text', x: 4, y: 9, content: 'Dark Roast 250g | Fair Trade', fontSize: '1', bold: false, width: 50, height: 4 },
      { id: 'bc1', type: 'barcode', x: 4, y: 15, content: '793573194012', barcodeType: 'CODE128', width: 50, height: 12, showText: true },
      { id: 't3', type: 'text', x: 4, y: 32, content: 'SKU: CF-250-DRK', fontSize: '1', bold: false, width: 28, height: 4 },
      { id: 't4', type: 'text', x: 35, y: 30, content: '$14.99', fontSize: '4', bold: true, width: 19, height: 7 },
    ],
  },

  // ─── 2. Compact Price Tag ────────────────────────────────────────────────
  {
    id: 'price-tag-40x30',
    name: 'Compact Price Tag',
    category: 'retail',
    description: 'Compact 40x30mm retail price tag for apparel, jewelry, and accessories.',
    size: { name: '40×30mm (Jewelry / Price)', width: 40, height: 30 },
    elements: [
      { id: 't1', type: 'text', x: 3, y: 2, content: 'BRAVON APPAREL', fontSize: '1', bold: true, width: 34, height: 3 },
      { id: 't2', type: 'text', x: 3, y: 6, content: 'Cotton T-Shirt (M)', fontSize: '2', bold: false, width: 34, height: 4 },
      { id: 'bc1', type: 'barcode', x: 3, y: 11, content: '0123456789', barcodeType: 'CODE128', width: 34, height: 9, showText: false },
      { id: 't3', type: 'text', x: 3, y: 23, content: 'SIZE: M', fontSize: '1', bold: true, width: 16, height: 4 },
      { id: 't4', type: 'text', x: 20, y: 21, content: '$29.00', fontSize: '3', bold: true, width: 17, height: 6 },
    ],
  },

  // ─── 3. Jewelry / Cable Dumbbell Tag ─────────────────────────────────────
  {
    id: 'jewelry-dumbbell-40x25',
    name: 'Jewelry & Cable Dumbbell Tag',
    category: 'retail',
    description: 'Folded dumbbell wrap label with dual side print for rings, necklaces, and cables.',
    size: { name: '40×25mm (Jewelry Wrap)', width: 40, height: 25 },
    elements: [
      { id: 't1', type: 'text', x: 2, y: 2, content: 'BRAVON FINE', fontSize: '1', bold: true, width: 18, height: 3 },
      { id: 't2', type: 'text', x: 2, y: 6, content: '14K Gold / 2.4g', fontSize: '1', bold: false, width: 18, height: 3 },
      { id: 'bc1', type: 'barcode', x: 2, y: 11, content: 'JW-8812', barcodeType: 'CODE128', width: 17, height: 7, showText: false },
      { id: 'l1', type: 'line', x: 20, y: 1, width: 1, thickness: 1 },
      { id: 't3', type: 'text', x: 22, y: 2, content: 'SKU: RG-104', fontSize: '1', bold: false, width: 16, height: 3 },
      { id: 't4', type: 'text', x: 22, y: 7, content: 'PRICE:', fontSize: '1', bold: false, width: 16, height: 3 },
      { id: 't5', type: 'text', x: 22, y: 12, content: '$240', fontSize: '4', bold: true, width: 16, height: 7 },
    ],
  },

  // ─── 4. Standard 4"×6" Shipping Waybill ──────────────────────────────────
  {
    id: 'shipping-4x6',
    name: 'Standard 4"×6" Shipping Waybill',
    category: 'shipping',
    description: 'Full logistics shipping label with Origin, Destination, Carrier Zone, and Code128 Tracking.',
    size: { name: '101.6×152.4mm (4"×6" Shipping)', width: 101.6, height: 152.4 },
    elements: [
      { id: 'b1', type: 'box', x: 3, y: 3, width: 95.6, height: 146.4, thickness: 2 },
      { id: 't1', type: 'text', x: 6, y: 6, content: 'PRIORITY EXPRESS 2-DAY', fontSize: '3', bold: true, width: 65, height: 6 },
      { id: 'b2', type: 'box', x: 74, y: 5, width: 22, height: 12, thickness: 2 },
      { id: 't2', type: 'text', x: 77, y: 8, content: 'ZONE 4', fontSize: '3', bold: true, width: 16, height: 5 },
      { id: 'l1', type: 'line', x: 3, y: 19, width: 95.6, thickness: 2 },
      { id: 't3', type: 'text', x: 6, y: 21, content: 'SHIP FROM:', fontSize: '1', bold: true, width: 40, height: 3 },
      { id: 't4', type: 'text', x: 6, y: 25, content: 'Bravon Distribution Center', fontSize: '2', bold: false, width: 85, height: 4 },
      { id: 't5', type: 'text', x: 6, y: 30, content: '100 Industrial Parkway, Dock 4', fontSize: '2', bold: false, width: 85, height: 4 },
      { id: 't6', type: 'text', x: 6, y: 35, content: 'Chicago IL 60601-2004', fontSize: '2', bold: false, width: 85, height: 4 },
      { id: 'l2', type: 'line', x: 3, y: 42, width: 95.6, thickness: 2 },
      { id: 't7', type: 'text', x: 6, y: 44, content: 'SHIP TO:', fontSize: '1', bold: true, width: 40, height: 3 },
      { id: 't8', type: 'text', x: 6, y: 49, content: 'ALEXANDER HAMILTON', fontSize: '4', bold: true, width: 85, height: 6 },
      { id: 't9', type: 'text', x: 6, y: 57, content: 'ACME CORP - SUITE 400', fontSize: '2', bold: false, width: 85, height: 4 },
      { id: 't10', type: 'text', x: 6, y: 62, content: '742 EVERGREEN TERRACE', fontSize: '3', bold: true, width: 85, height: 5 },
      { id: 't11', type: 'text', x: 6, y: 69, content: 'SPRINGFIELD OR 97477', fontSize: '3', bold: true, width: 85, height: 5 },
      { id: 'l3', type: 'line', x: 3, y: 77, width: 95.6, thickness: 3 },
      { id: 't12', type: 'text', x: 6, y: 80, content: 'TRACKING #:', fontSize: '1', bold: false, width: 40, height: 3 },
      { id: 't13', type: 'text', x: 6, y: 84, content: '1Z 999 999 92 9823 4810', fontSize: '3', bold: true, width: 60, height: 5 },
      { id: 'qr1', type: 'qrcode', x: 74, y: 80, content: 'https://track.bravon.app/PKG-98234-US', size: 20, errorCorrection: 'M' },
      { id: 'bc1', type: 'barcode', x: 8, y: 104, content: '1Z9999999298234810', barcodeType: 'CODE128', width: 84, height: 24, showText: true },
      { id: 'l4', type: 'line', x: 3, y: 139, width: 95.6, thickness: 1 },
      { id: 't14', type: 'text', x: 6, y: 142, content: 'WEIGHT: 3.5 LBS | REF: ORD-49102-B | CARRIER: GROUND', fontSize: '1', bold: false, width: 90, height: 4 },
    ],
  },

  // ─── 5. Amazon FBA Box & Carton Label ─────────────────────────────────────
  {
    id: 'amazon-fba-4x6',
    name: 'Amazon FBA Box & Carton Label',
    category: 'shipping',
    description: 'FBA carton shipment ID with Code128 barcode, SKU item count, and fulfillment center routing.',
    size: { name: '101.6×152.4mm (4"×6" Shipping)', width: 101.6, height: 152.4 },
    elements: [
      { id: 'b1', type: 'box', x: 3, y: 3, width: 95.6, height: 146.4, thickness: 3 },
      { id: 't1', type: 'text', x: 6, y: 6, content: 'FBA SHIPMENT IDENTIFIER', fontSize: '3', bold: true, width: 65, height: 5 },
      { id: 'b2', type: 'box', x: 72, y: 5, width: 24, height: 14, thickness: 2 },
      { id: 't2', type: 'text', x: 74, y: 6, content: 'FC DEST:', fontSize: '1', bold: false, width: 20, height: 3 },
      { id: 't3', type: 'text', x: 74, y: 10, content: 'MDW2', fontSize: '3', bold: true, width: 20, height: 5 },
      { id: 'l1', type: 'line', x: 3, y: 21, width: 95.6, thickness: 2 },
      { id: 't4', type: 'text', x: 6, y: 23, content: 'FBA SHIPMENT ID:', fontSize: '1', bold: false, width: 50, height: 3 },
      { id: 't5', type: 'text', x: 6, y: 27, content: 'FBA17Z8PQ9KL', fontSize: '4', bold: true, width: 60, height: 6 },
      { id: 'bc1', type: 'barcode', x: 6, y: 35, content: 'FBA17Z8PQ9KLU000001', barcodeType: 'CODE128', width: 88, height: 25, showText: true },
      { id: 'l2', type: 'line', x: 3, y: 67, width: 95.6, thickness: 2 },
      { id: 't6', type: 'text', x: 6, y: 70, content: 'BOX CONTENTS:', fontSize: '1', bold: true, width: 40, height: 3 },
      { id: 't7', type: 'text', x: 6, y: 75, content: 'SKU: B09X-PRINTER-STAND', fontSize: '2', bold: true, width: 85, height: 4 },
      { id: 't8', type: 'text', x: 6, y: 81, content: 'QUANTITY: 24 UNITS | SINGLE SKU CARRIER CASE', fontSize: '2', bold: false, width: 85, height: 4 },
      { id: 'l3', type: 'line', x: 3, y: 89, width: 95.6, thickness: 2 },
      { id: 't9', type: 'text', x: 6, y: 92, content: 'PACKAGE ID (BOX 1 OF 4):', fontSize: '1', bold: false, width: 60, height: 3 },
      { id: 'bc2', type: 'barcode', x: 6, y: 98, content: 'amzn.ss.01.FBA17Z8PQ9KL', barcodeType: 'CODE128', width: 88, height: 25, showText: true },
      { id: 'l4', type: 'line', x: 3, y: 135, width: 95.6, thickness: 1 },
      { id: 't10', type: 'text', x: 6, y: 139, content: 'PLEASE LEAVE THIS LABEL UNCOVERED FOR CARRIER SCAN', fontSize: '1', bold: true, width: 90, height: 4 },
    ],
  },

  // ─── 6. Food / Deli Best-Before & Allergen Tag ────────────────────────────
  {
    id: 'food-expiry-58x40',
    name: 'Food Expiration & Allergen Tag',
    category: 'food',
    description: 'Commercial kitchen deli tag with pack date, best-before notice, ingredients, and allergen warning.',
    size: { name: '58×40mm (Retail / Barcode)', width: 58, height: 40 },
    elements: [
      { id: 't1', type: 'text', x: 3, y: 2, content: 'ROASTED ARTISAN TURKEY', fontSize: '2', bold: true, width: 52, height: 4 },
      { id: 'l1', type: 'line', x: 3, y: 7, width: 52, thickness: 1 },
      { id: 't2', type: 'text', x: 3, y: 9, content: 'PACKED: 16-SEP-2026', fontSize: '1', bold: false, width: 26, height: 3 },
      { id: 't3', type: 'text', x: 30, y: 9, content: 'USE BY: 23-SEP-2026', fontSize: '1', bold: true, width: 26, height: 3 },
      { id: 't4', type: 'text', x: 3, y: 13, content: 'KEEP REFRIGERATED (AT OR BELOW 4°C)', fontSize: '1', bold: false, width: 52, height: 3 },
      { id: 't5', type: 'text', x: 3, y: 17, content: 'Ingredients: Turkey Breast, Sea Salt, Herbs.', fontSize: '1', bold: false, width: 52, height: 3 },
      { id: 't6', type: 'text', x: 3, y: 21, content: 'ALLERGENS: GLUTEN-FREE • CONTAINS CELERY', fontSize: '1', bold: true, width: 52, height: 3 },
      { id: 'bc1', type: 'barcode', x: 3, y: 26, content: '20819400125', barcodeType: 'CODE128', width: 34, height: 9, showText: false },
      { id: 't7', type: 'text', x: 38, y: 28, content: '350g', fontSize: '3', bold: true, width: 17, height: 5 },
      { id: 't8', type: 'text', x: 38, y: 34, content: '$8.75', fontSize: '3', bold: true, width: 17, height: 5 },
    ],
  },

  // ─── 7. Medical & Laboratory Specimen Sample ─────────────────────────────
  {
    id: 'medical-specimen-50x30',
    name: 'Medical & Lab Specimen Tube Tag',
    category: 'medical',
    description: 'Clinical laboratory specimen label with Patient MRN barcode, collection time, and tube test type.',
    size: { name: '50×30mm (Medical / Specimen)', width: 50, height: 30 },
    elements: [
      { id: 't1', type: 'text', x: 2, y: 2, content: 'DOE, JANE (F - 42Y)', fontSize: '2', bold: true, width: 46, height: 4 },
      { id: 't2', type: 'text', x: 2, y: 6, content: 'MRN: 902-814-01 | DOB: 14-MAY-1984', fontSize: '1', bold: false, width: 46, height: 3 },
      { id: 'bc1', type: 'barcode', x: 2, y: 10, content: 'MRN90281401', barcodeType: 'CODE128', width: 46, height: 10, showText: false },
      { id: 't3', type: 'text', x: 2, y: 22, content: 'TEST: CBC + METABOLIC PANEL', fontSize: '1', bold: true, width: 46, height: 3 },
      { id: 't4', type: 'text', x: 2, y: 26, content: 'COLL: 16-SEP 08:30 • TECH: DR-44', fontSize: '1', bold: false, width: 46, height: 3 },
    ],
  },

  // ─── 8. Warehouse Asset Tracking Tag ─────────────────────────────────────
  {
    id: 'inventory-asset-80x50',
    name: 'Warehouse Asset Tag',
    category: 'inventory',
    description: 'High-visibility inventory tracking tag with QR code, serial number, and department.',
    size: { name: '80×50mm (Medium / Storage)', width: 80, height: 50 },
    elements: [
      { id: 'b1', type: 'box', x: 2, y: 2, width: 76, height: 46, thickness: 2 },
      { id: 't1', type: 'text', x: 6, y: 5, content: 'PROPERTY OF BRAVON LOGISTICS', fontSize: '2', bold: true, width: 68, height: 4 },
      { id: 'l1', type: 'line', x: 6, y: 10, width: 68, thickness: 2 },
      { id: 'qr1', type: 'qrcode', x: 6, y: 14, content: 'https://asset.bravon.app/item/AST-884920', size: 24, errorCorrection: 'M' },
      { id: 't2', type: 'text', x: 34, y: 14, content: 'ASSET ID:', fontSize: '1', bold: false, width: 38, height: 3 },
      { id: 't3', type: 'text', x: 34, y: 18, content: 'AST-884920', fontSize: '3', bold: true, width: 38, height: 5 },
      { id: 't4', type: 'text', x: 34, y: 26, content: 'Dept: Fulfillment Center B', fontSize: '1', bold: false, width: 38, height: 3 },
      { id: 't5', type: 'text', x: 34, y: 31, content: 'SN: 2026-X99-4401', fontSize: '1', bold: false, width: 38, height: 3 },
      { id: 't6', type: 'text', x: 6, y: 42, content: 'DO NOT REMOVE OR TAMPER WITH THIS TAG', fontSize: '1', bold: false, width: 68, height: 3 },
    ],
  },

  // ─── 9. Warehouse Bin / Rack Location Locator ────────────────────────────
  {
    id: 'warehouse-bin-70x30',
    name: 'Warehouse Bin & Rack Locator',
    category: 'inventory',
    description: 'High-contrast warehouse shelf rack locator tag with large aisle coordinates and scan barcode.',
    size: { name: '70×30mm (Warehouse Bin)', width: 70, height: 30 },
    elements: [
      { id: 'b1', type: 'box', x: 2, y: 2, width: 66, height: 26, thickness: 2 },
      { id: 't1', type: 'text', x: 4, y: 4, content: 'AISLE 04 • BAY 12 • LVL 3', fontSize: '1', bold: false, width: 62, height: 3 },
      { id: 't2', type: 'text', x: 4, y: 8, content: '04-12-03-A', fontSize: '4', bold: true, width: 62, height: 6 },
      { id: 'bc1', type: 'barcode', x: 4, y: 16, content: '041203A', barcodeType: 'CODE128', width: 62, height: 10, showText: false },
    ],
  },

  // ─── 10. Visitor / Conference Access Badge ────────────────────────────────
  {
    id: 'visitor-badge-80x50',
    name: 'Conference & Visitor Access Badge',
    category: 'office',
    description: 'Event attendee name badge with organization, VIP access pill, and QR check-in code.',
    size: { name: '80×50mm (Medium / Storage)', width: 80, height: 50 },
    elements: [
      { id: 'b1', type: 'box', x: 2, y: 2, width: 76, height: 46, thickness: 2 },
      { id: 't1', type: 'text', x: 6, y: 5, content: 'GLOBAL LOGISTICS SUMMIT 2026', fontSize: '1', bold: true, width: 68, height: 3 },
      { id: 'l1', type: 'line', x: 6, y: 9, width: 68, thickness: 1 },
      { id: 't2', type: 'text', x: 6, y: 12, content: 'SARAH', fontSize: '5', bold: true, width: 48, height: 8 },
      { id: 't3', type: 'text', x: 6, y: 21, content: 'JENNINGS', fontSize: '4', bold: true, width: 48, height: 6 },
      { id: 't4', type: 'text', x: 6, y: 29, content: 'Bravon Logistics Systems', fontSize: '2', bold: false, width: 48, height: 4 },
      { id: 'qr1', type: 'qrcode', x: 56, y: 12, content: 'https://event.bravon.app/v/SARAH-J-881', size: 18, errorCorrection: 'M' },
      { id: 'b2', type: 'box', x: 6, y: 36, width: 32, height: 8, thickness: 2 },
      { id: 't5', type: 'text', x: 8, y: 38, content: 'ALL ACCESS VIP', fontSize: '2', bold: true, width: 28, height: 4 },
      { id: 't6', type: 'text', x: 44, y: 39, content: 'SEP 16-18, 2026', fontSize: '1', bold: false, width: 30, height: 3 },
    ],
  },

  // ─── 11. Return Merchandise Authorization (RMA) ───────────────────────────
  {
    id: 'rma-return-75x50',
    name: 'Return Merchandise (RMA) Tag',
    category: 'inventory',
    description: 'E-commerce return tag with RMA tracking barcode, customer ID, and inspection checklist.',
    size: { name: '75×50mm (RMA Return)', width: 75, height: 50 },
    elements: [
      { id: 'b1', type: 'box', x: 2, y: 2, width: 71, height: 46, thickness: 2 },
      { id: 't1', type: 'text', x: 5, y: 5, content: 'RETURN MERCHANDISE AUTH (RMA)', fontSize: '2', bold: true, width: 64, height: 4 },
      { id: 'l1', type: 'line', x: 5, y: 10, width: 64, thickness: 1 },
      { id: 't2', type: 'text', x: 5, y: 12, content: 'RMA #: RMA-2026-9941', fontSize: '2', bold: true, width: 64, height: 4 },
      { id: 'bc1', type: 'barcode', x: 5, y: 18, content: 'RMA20269941', barcodeType: 'CODE128', width: 64, height: 12, showText: false },
      { id: 't3', type: 'text', x: 5, y: 33, content: 'Reason: Defective Unit / Exchange Requested', fontSize: '1', bold: false, width: 64, height: 3 },
      { id: 'b2', type: 'box', x: 5, y: 38, width: 4, height: 4, thickness: 1 },
      { id: 't4', type: 'text', x: 11, y: 39, content: 'Passed QA', fontSize: '1', bold: false, width: 18, height: 3 },
      { id: 'b3', type: 'box', x: 32, y: 38, width: 4, height: 4, thickness: 1 },
      { id: 't5', type: 'text', x: 38, y: 39, content: 'Restock Fee', fontSize: '1', bold: false, width: 18, height: 3 },
      { id: 'b4', type: 'box', x: 58, y: 38, width: 4, height: 4, thickness: 1 },
      { id: 't6', type: 'text', x: 64, y: 39, content: 'Scrap', fontSize: '1', bold: false, width: 12, height: 3 },
    ],
  },

  // ─── 12. Fragile / Handle With Care Warning ──────────────────────────────
  {
    id: 'fragile-warning-80x50',
    name: 'Fragile / Handle With Care',
    category: 'warning',
    description: 'High-contrast warning label with bold notice and handle-with-care instructions.',
    size: { name: '80×50mm (Medium / Storage)', width: 80, height: 50 },
    elements: [
      { id: 'b1', type: 'box', x: 3, y: 3, width: 74, height: 44, thickness: 4 },
      { id: 'b2', type: 'box', x: 5, y: 5, width: 70, height: 40, thickness: 1 },
      { id: 't1', type: 'text', x: 14, y: 8, content: '⚠️ FRAGILE ⚠️', fontSize: '4', bold: true, width: 52, height: 7 },
      { id: 'l1', type: 'line', x: 8, y: 17, width: 64, thickness: 2 },
      { id: 't2', type: 'text', x: 12, y: 20, content: 'HANDLE WITH CARE', fontSize: '3', bold: true, width: 56, height: 5 },
      { id: 't3', type: 'text', x: 9, y: 27, content: 'DO NOT DROP • KEEP DRY • THIS SIDE UP', fontSize: '1', bold: true, width: 62, height: 4 },
      { id: 'bc1', type: 'barcode', x: 14, y: 33, content: 'FRAGILE-GLASS', barcodeType: 'CODE128', width: 52, height: 8, showText: false },
    ],
  },
];
```

---

## 4. Pure TypeScript TSPL Generator (`utils/tspl.ts`)

> **Why this matters:** Do NOT rely on native C/Rust code on mobile. Run TSPL compilation in pure TypeScript inside React Native. It runs in microseconds and outputs an exact `Uint8Array` that can be sent directly over Bluetooth.

Save this file as `src/utils/tspl.ts`:

```typescript
import { LabelDocument, PrintOptions, LabelElement } from '../types/label';

/** Convert millimeters to thermal printer dots at 203 DPI (8 dots/mm) */
function mmToDots(mm: number): number {
  return Math.max(0, Math.round(mm * 8));
}

export class TsplBuilder {
  private commands: string[] = [];

  size(widthMm: number, heightMm: number): this {
    this.commands.push(`SIZE ${widthMm} mm,${heightMm} mm`);
    return this;
  }

  gap(gapMm: number = 2, offsetMm: number = 0): this {
    this.commands.push(`GAP ${gapMm} mm,${offsetMm} mm`);
    return this;
  }

  continuous(): this {
    this.commands.push('GAP 0 mm,0 mm');
    return this;
  }

  bline(lengthMm: number = 2, offsetMm: number = 0): this {
    this.commands.push(`BLINE ${lengthMm} mm,${offsetMm} mm`);
    return this;
  }

  direction(dir: 0 | 1 = 0): this {
    this.commands.push(`DIRECTION ${dir},0`);
    return this;
  }

  reference(x: number = 0, y: number = 0): this {
    this.commands.push(`REFERENCE ${x},${y}`);
    return this;
  }

  speed(speedInchesPerSec: number = 3): this {
    const s = Math.min(6, Math.max(1, speedInchesPerSec));
    this.commands.push(`SPEED ${s}`);
    return this;
  }

  density(densityVal: number = 10): this {
    const d = Math.min(15, Math.max(1, densityVal));
    this.commands.push(`DENSITY ${d}`);
    return this;
  }

  cls(): this {
    this.commands.push('CLS');
    return this;
  }

  text(
    x: number,
    y: number,
    font: string,
    rotation: number,
    xMul: number,
    yMul: number,
    content: string
  ): this {
    // Escape quotes
    const safeContent = content.replace(/"/g, '\\"');
    this.commands.push(`TEXT ${x},${y},"${font}",${rotation},${xMul},${yMul},"${safeContent}"`);
    return this;
  }

  barcode(
    x: number,
    y: number,
    codeType: string,
    heightDots: number,
    humanReadable: 0 | 1,
    rotation: number,
    narrowDots: number,
    wideDots: number,
    content: string
  ): this {
    const safeContent = content.replace(/"/g, '');
    this.commands.push(
      `BARCODE ${x},${y},"${codeType}",${heightDots},${humanReadable},${rotation},${narrowDots},${wideDots},"${safeContent}"`
    );
    return this;
  }

  qrcode(
    x: number,
    y: number,
    ecc: 'L' | 'M' | 'Q' | 'H',
    cellWidth: number,
    rotation: number,
    content: string
  ): this {
    this.commands.push(`QRCODE ${x},${y},${ecc},${cellWidth},A,${rotation},"${content}"`);
    return this;
  }

  bar(x: number, y: number, widthDots: number, heightDots: number): this {
    this.commands.push(`BAR ${x},${y},${widthDots},${heightDots}`);
    return this;
  }

  box(x: number, y: number, endX: number, endY: number, thickness: number): this {
    this.commands.push(`BOX ${x},${y},${endX},${endY},${thickness}`);
    return this;
  }

  print(sets: number = 1, copies: number = 1): this {
    this.commands.push(`PRINT ${Math.max(1, sets)},${Math.max(1, copies)}`);
    return this;
  }

  feed(): this {
    this.commands.push('FORMFEED');
    return this;
  }

  /** Outputs ASCII/UTF-8 Byte Stream ready for Bluetooth socket */
  buildBytes(): Uint8Array {
    const fullScript = this.commands.join('\r\n') + '\r\n';
    const encoder = new TextEncoder();
    return encoder.encode(fullScript);
  }
}

/**
 * Main translation function: converts LabelDocument JSON to TSPL byte stream
 */
export function documentToTspl(doc: LabelDocument, options?: PrintOptions): Uint8Array {
  const b = new TsplBuilder();

  // 1. Configure dimensions
  b.size(doc.size.width, doc.size.height);

  const paperType = options?.paperType || 'gap';
  if (paperType === 'continuous') {
    b.continuous();
  } else if (paperType === 'black') {
    b.bline(2, 0);
  } else {
    b.gap(2, 0);
  }

  b.direction(0);
  b.reference(0, 0);

  if (options?.speed) b.speed(options.speed);
  if (options?.density) b.density(options.density);

  b.cls();

  // 2. Render elements
  for (const el of doc.elements) {
    const xDots = mmToDots(el.x);
    const yDots = mmToDots(el.y);
    const rot = el.rotation || 0;

    if (el.type === 'text') {
      const sizeInt = parseInt(el.fontSize || '2', 10);
      let font = '3';
      let mul = 1;
      let lineSpacingDots = 28;

      switch (sizeInt) {
        case 1:
          font = '1';
          mul = 1;
          lineSpacingDots = 18;
          break;
        case 2:
          font = '2';
          mul = 1;
          lineSpacingDots = 24;
          break;
        case 3:
          font = '3';
          mul = 1;
          lineSpacingDots = 30;
          break;
        case 4:
          font = '3';
          mul = 2;
          lineSpacingDots = 42;
          break;
        case 5:
          font = '4';
          mul = 2;
          lineSpacingDots = 56;
          break;
      }

      // CRITICAL TSPL FIX: Split multiline strings! Raw \n breaks TSPL command lines.
      const lines = el.content.split('\n');
      lines.forEach((line, idx) => {
        const lineY = yDots + idx * lineSpacingDots;
        b.text(xDots, lineY, font, rot, mul, mul, line);
      });
    } else if (el.type === 'barcode') {
      const heightDots = Math.max(20, mmToDots(el.height));
      const human: 0 | 1 = el.showText !== false ? 1 : 0;

      let tsplCode = '128';
      switch (el.barcodeType) {
        case 'CODE39':
          tsplCode = '39';
          break;
        case 'EAN13':
          tsplCode = 'EAN13';
          break;
        case 'EAN8':
          tsplCode = 'EAN8';
          break;
        case 'UPC-A':
          tsplCode = 'UPCA';
          break;
        case 'ITF':
          tsplCode = 'ITF25';
          break;
        default:
          tsplCode = '128';
          break;
      }

      // CRITICAL TSPL FIX: Set narrow=2 dots and wide=4 dots.
      // Do NOT scale narrow bar dynamically with height!
      b.barcode(xDots, yDots, tsplCode, heightDots, human, rot, 2, 4, el.content);
    } else if (el.type === 'qrcode') {
      const cellWidth = Math.min(10, Math.max(2, Math.round(el.size / 5)));
      b.qrcode(xDots, yDots, el.errorCorrection || 'M', cellWidth, rot, el.content);
    } else if (el.type === 'line') {
      const widthDots = mmToDots(el.width);
      const thickDots = (el.thickness || 2) * 2;
      b.bar(xDots, yDots, widthDots, Math.max(2, thickDots));
    } else if (el.type === 'box') {
      const endX = xDots + mmToDots(el.width);
      const endY = yDots + mmToDots(el.height);
      const thickDots = (el.thickness || 2) * 2;
      b.box(xDots, yDots, endX, endY, Math.max(2, thickDots));
    }
  }

  // 3. Trigger Print
  const copies = options?.copies || 1;
  b.print(1, copies);

  return b.buildBytes();
}
```

---

## 5. React Native WYSIWYG Preview Component (`components/LabelPreview.tsx`)

> **Key Lesson from Desktop UI/UX Bug:**
> In the preview modal, always give the preview container explicit dimensions (`scale = Math.min(availableWidth / doc.size.width, availableHeight / doc.size.height)`), and set `lineHeight: 1.15` and `maxWidth` on every text element to avoid text collisions.

```tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Rect, Line as SvgLine } from 'react-native-svg';
import { LabelDocument, LabelElement } from '../types/label';

interface LabelPreviewProps {
  document: LabelDocument;
  maxContainerWidth: number;
  maxContainerHeight: number;
}

export const LabelPreview: React.FC<LabelPreviewProps> = ({
  document,
  maxContainerWidth,
  maxContainerHeight,
}) => {
  // Compute scale so the label fits comfortably on phone screen
  const scale = Math.min(
    maxContainerWidth / document.size.width,
    maxContainerHeight / document.size.height,
    4.0
  );

  const paperWidth = Math.round(document.size.width * scale);
  const paperHeight = Math.round(document.size.height * scale);

  return (
    <View style={styles.wrapper}>
      {/* Dimension & Scale Header */}
      <View style={styles.headerBadge}>
        <Text style={styles.headerText}>
          {document.size.name} ({document.size.width}×{document.size.height}mm)
        </Text>
      </View>

      {/* Simulated Thermal Label Paper */}
      <View style={[styles.paper, { width: paperWidth, height: paperHeight }]}>
        {document.elements.map((el) => renderElement(el, scale, document.size.width))}
      </View>
    </View>
  );
};

function renderElement(el: LabelElement, scale: number, docWidthMm: number) {
  const x = Math.round(el.x * scale);
  const y = Math.round(el.y * scale);

  if (el.type === 'text') {
    const fontSizes: Record<string, number> = {
      '1': Math.max(7, Math.round(2.0 * scale)),
      '2': Math.max(8.5, Math.round(2.6 * scale)),
      '3': Math.max(10, Math.round(3.4 * scale)),
      '4': Math.max(12, Math.round(4.6 * scale)),
      '5': Math.max(15, Math.round(6.0 * scale)),
    };
    const fs = fontSizes[el.fontSize] || Math.round(2.6 * scale);
    const elementW = el.width ? Math.round(el.width * scale) : undefined;
    const maxW = Math.round((docWidthMm - el.x) * scale);

    return (
      <View
        key={el.id}
        style={[
          styles.element,
          {
            left: x,
            top: y,
            width: elementW,
            maxWidth: maxW,
          },
        ]}
      >
        <Text
          style={{
            fontSize: fs,
            fontWeight: el.bold ? '700' : '400',
            fontFamily: 'monospace',
            color: '#000000',
            lineHeight: fs * 1.2,
          }}
          numberOfLines={el.width ? 3 : undefined}
        >
          {el.content}
        </Text>
      </View>
    );
  }

  if (el.type === 'barcode') {
    const bw = Math.round((el.width || 40) * scale);
    const bh = Math.round(el.height * scale);

    // Generate high-density simulated barcode bars
    const bars: number[] = [];
    for (let i = 0; i < 40; i++) {
      bars.push(i % 3 === 0 ? 3 : 1);
    }

    return (
      <View
        key={el.id}
        style={[
          styles.element,
          {
            left: x,
            top: y,
            width: bw,
            height: bh,
            alignItems: 'center',
            justifyContent: 'space-between',
          },
        ]}
      >
        <Svg width="100%" height={el.showText !== false ? '75%' : '100%'} viewBox="0 0 100 30" preserveAspectRatio="none">
          {bars.map((w, i) => (
            <Rect key={i} x={i * 2.5} y={0} width={w} height={30} fill="#000" />
          ))}
        </Svg>
        {el.showText !== false && (
          <Text
            style={{
              fontSize: Math.max(8, Math.round(1.9 * scale)),
              fontFamily: 'monospace',
              color: '#000',
              textAlign: 'center',
            }}
          >
            {el.content}
          </Text>
        )}
      </View>
    );
  }

  if (el.type === 'qrcode') {
    const qSize = Math.round(el.size * scale);
    return (
      <View
        key={el.id}
        style={[
          styles.element,
          {
            left: x,
            top: y,
            width: qSize,
            height: qSize,
            borderWidth: 1,
            borderColor: '#000',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#FFF',
          },
        ]}
      >
        <Text style={{ fontSize: 9, fontWeight: 'bold' }}>QR</Text>
      </View>
    );
  }

  if (el.type === 'line') {
    const w = Math.round(el.width * scale);
    const th = Math.max(1, Math.round((el.thickness || 2) * (scale / 4)));
    return (
      <View
        key={el.id}
        style={[styles.element, { left: x, top: y, width: w, height: th, backgroundColor: '#000' }]}
      />
    );
  }

  if (el.type === 'box') {
    const w = Math.round(el.width * scale);
    const h = Math.round(el.height * scale);
    const th = Math.max(1, Math.round((el.thickness || 2) * (scale / 4)));
    return (
      <View
        key={el.id}
        style={[
          styles.element,
          {
            left: x,
            top: y,
            width: w,
            height: h,
            borderWidth: th,
            borderColor: '#000',
            backgroundColor: 'transparent',
          },
        ]}
      />
    );
  }

  return null;
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
  },
  headerBadge: {
    marginBottom: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  headerText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4B5563',
  },
  paper: {
    backgroundColor: '#FFFFFF',
    borderRadius: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
    overflow: 'hidden',
  },
  element: {
    position: 'absolute',
  },
});
```

---

## 6. Mobile Bluetooth Dispatch (SPP / BLE Chunking)

Thermal printers have a small receive buffer (typically 1KB to 4KB). Sending a large TSPL byte stream all at once over mobile Bluetooth will drop bytes!

Use this chunking sender in your Bluetooth manager (`services/printerService.ts`):

```typescript
/**
 * Transmits a raw TSPL byte array over a Bluetooth socket in chunks
 * to prevent hardware buffer overflow on ZJiang / TSC thermal printers.
 */
export async function sendTsplChunks(
  bytes: Uint8Array,
  writeFn: (chunkBase64: string) => Promise<void>,
  chunkSize: number = 256,
  delayMs: number = 25
): Promise<void> {
  const total = bytes.length;
  let offset = 0;

  while (offset < total) {
    const end = Math.min(offset + chunkSize, total);
    const chunk = bytes.slice(offset, end);

    // Convert chunk to base64
    const base64Chunk = uint8ArrayToBase64(chunk);
    await writeFn(base64Chunk);

    offset = end;
    if (offset < total) {
      await new Promise((res) => setTimeout(res, delayMs));
    }
  }
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
```

---

## 7. Critical Pitfalls & Troubleshooting Checklist

| Issue | Root Cause | Solution |
|---|---|---|
| **Barcode prints off the edge / truncated** | Dynamically scaling `narrow` bar with label height. | Always lock `narrow = 2` dots and `wide = 4` dots (at 203 DPI). |
| **Printer prints gibberish or syntax error** | Newlines (`\n`) in text content. | TSPL expects one command per line. Split multiline text by `\n` and offset Y position. |
| **Printer feeds blank paper without printing** | Incorrect paper sensor mode (`GAP` vs `CONTINUOUS`). | Use `GAP 2 mm,0 mm` for die-cut labels; `GAP 0 mm,0 mm` for receipt rolls. |
| **Bluetooth connects but printer doesn't react** | Printer receive buffer overflow or wrong baud rate. | Chunk transmissions into 256-byte packets with 25ms delay. Default baud is 9600 (or 115200 on newer firmware). |
| **Preview elements collide or overlap** | Missing `maxWidth` or unconstrained line-height. | Wrap elements in bounded views and compute font sizes strictly proportional to mm scale (`fs = 2.6 * scale`). |
| **Need to calibrate gap sensor** | Label paper skipped or misaligned. | Send command `FORMFEED\r\n` to advance exactly 1 label to the tear bar. |

---

## 8. Summary of Shared Files

To keep Desktop and Mobile 100% synchronized:
1. `src/types/label.ts` — Identical on Desktop and Mobile.
2. `src/data/templates.ts` — Identical on Desktop and Mobile (all 12 templates).
3. `src/utils/tspl.ts` — Identical pure TypeScript TSPL generator.
