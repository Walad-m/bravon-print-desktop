import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import {
  Type,
  Barcode,
  QrCode,
  Minus,
  Square,
  Trash2,
  Printer,
  RotateCcw,
  ChevronDown,
} from 'lucide-react';
import { DesignerCanvas } from '../components/designer/DesignerCanvas';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { useDesignerStore } from '../stores/useDesignerStore';
import type { NewElement } from '../stores/useDesignerStore';
import { usePrinterStore } from '../stores/usePrinterStore';
import { ConnectPrinterModal } from '../components/printer/ConnectPrinterModal';
import { PrintPreviewModal } from '../components/printer/PrintPreviewModal';
import { PRESET_LABEL_SIZES, LabelElement, BarcodeType, FontSize } from '../types/label';
import styles from './designer.module.css';

export const Route = createFileRoute('/designer')({
  component: Designer,
});

interface ToolSidebarProps {
  onOpenPrintPreview: () => void;
  onOpenConnectModal: () => void;
}

// ─── Tool sidebar ─────────────────────────────────────────────────────────────
function ToolSidebar({ onOpenPrintPreview, onOpenConnectModal }: ToolSidebarProps) {
  const { addElement, labelSize, setLabelSize, copies, setCopies, clearAll, elements } =
    useDesignerStore();
  const { connectedDevice } = usePrinterStore();
  const [customW, setCustomW] = useState('');
  const [customH, setCustomH] = useState('');

  const handleAddText = () => {
    addElement({
      type: 'text',
      x: 5,
      y: 5,
      content: 'Sample Text',
      fontSize: '3' as FontSize,
      bold: false,
      rotation: 0,
      width: 40,
      height: 8,
    } as NewElement);
  };

  const handleAddBarcode = () => {
    addElement({
      type: 'barcode',
      x: 5,
      y: 18,
      content: '1234567890',
      barcodeType: 'CODE128' as BarcodeType,
      width: 48,
      height: 12,
      showText: true,
      rotation: 0,
    } as NewElement);
  };

  const handleAddQR = () => {
    addElement({
      type: 'qrcode',
      x: 5,
      y: 10,
      content: 'https://bravon.app',
      size: 20,
      errorCorrection: 'M',
      rotation: 0,
    } as NewElement);
  };

  const handleAddLine = () => {
    addElement({
      type: 'line',
      x: 5,
      y: 28,
      width: 48,
      thickness: 2,
      rotation: 0,
    } as NewElement);
  };

  const handleAddBox = () => {
    addElement({
      type: 'box',
      x: 3,
      y: 3,
      width: labelSize.width - 6,
      height: labelSize.height - 6,
      thickness: 2,
      rotation: 0,
    } as NewElement);
  };

  const isCustomSize = labelSize.name === 'Custom';

  return (
    <div className={styles.sidebar}>
      {/* Label Size */}
      <section className={styles.sidebarSection}>
        <h3 className={styles.sectionTitle}>Label Size</h3>
        <div className={styles.selectWrapper}>
          <select
            className={styles.select}
            value={labelSize.name}
            onChange={(e) => {
              const preset = PRESET_LABEL_SIZES.find((p) => p.name === e.target.value);
              if (preset) setLabelSize(preset);
            }}
          >
            {PRESET_LABEL_SIZES.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
          <ChevronDown size={14} className={styles.selectIcon} />
        </div>
        {isCustomSize && (
          <div className={styles.row}>
            <Input
              label="W (mm)"
              type="number"
              value={customW}
              onChange={(e) => setCustomW(e.target.value)}
              onBlur={() => {
                const w = parseFloat(customW);
                const h = parseFloat(customH);
                if (!isNaN(w) && !isNaN(h)) setLabelSize({ name: 'Custom', width: w, height: h });
              }}
            />
            <Input
              label="H (mm)"
              type="number"
              value={customH}
              onChange={(e) => setCustomH(e.target.value)}
              onBlur={() => {
                const w = parseFloat(customW);
                const h = parseFloat(customH);
                if (!isNaN(w) && !isNaN(h)) setLabelSize({ name: 'Custom', width: w, height: h });
              }}
            />
          </div>
        )}
        <div className={styles.labelMeta}>
          {labelSize.width} × {labelSize.height} mm (203 DPI)
        </div>
      </section>

      {/* Add Elements */}
      <section className={styles.sidebarSection}>
        <h3 className={styles.sectionTitle}>Add Elements</h3>
        <div className={styles.toolGrid}>
          <button className={styles.toolBtn} onClick={handleAddText} title="Add Text">
            <Type size={18} />
            <span>Text</span>
          </button>
          <button className={styles.toolBtn} onClick={handleAddBarcode} title="Add Barcode">
            <Barcode size={18} />
            <span>Barcode</span>
          </button>
          <button className={styles.toolBtn} onClick={handleAddQR} title="Add QR Code">
            <QrCode size={18} />
            <span>QR Code</span>
          </button>
          <button className={styles.toolBtn} onClick={handleAddLine} title="Add Line">
            <Minus size={18} />
            <span>Line</span>
          </button>
          <button className={styles.toolBtn} onClick={handleAddBox} title="Add Box">
            <Square size={18} />
            <span>Box</span>
          </button>
        </div>
      </section>

      {/* Print Controls */}
      <section className={styles.sidebarSection}>
        <h3 className={styles.sectionTitle}>Print Output</h3>
        <Input
          label="Default Copies"
          type="number"
          min={1}
          max={99}
          value={copies}
          onChange={(e) => setCopies(Math.max(1, parseInt(e.target.value) || 1))}
        />
        <div className={styles.printerStatus}>
          {connectedDevice ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className={styles.connected}>● {connectedDevice.name}</span>
              <button
                onClick={onOpenConnectModal}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-primary)',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                }}
              >
                Change
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className={styles.disconnected}>● No printer</span>
              <button
                onClick={onOpenConnectModal}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-primary)',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                }}
              >
                Connect
              </button>
            </div>
          )}
        </div>

        <Button
          variant="primary"
          onClick={onOpenPrintPreview}
          disabled={elements.length === 0}
          style={{ width: '100%', marginTop: 'var(--space-2)' }}
        >
          <Printer size={16} style={{ marginRight: 6 }} />
          Print Label ({elements.length})
        </Button>

        <Button
          variant="secondary"
          onClick={clearAll}
          style={{ width: '100%', marginTop: 'var(--space-2)' }}
        >
          <RotateCcw size={14} style={{ marginRight: 6 }} />
          Clear Canvas
        </Button>
      </section>
    </div>
  );
}

// ─── Properties panel ─────────────────────────────────────────────────────────
function PropertiesPanel() {
  const { elements, selectedElementId, updateElement, removeElement } = useDesignerStore();
  const el = elements.find((e) => e.id === selectedElementId);

  if (!el) {
    return (
      <div className={styles.propertiesEmpty}>
        <p>Select an element on canvas to edit its properties.</p>
      </div>
    );
  }

  const update = (updates: Partial<LabelElement>) => updateElement(el.id, updates);

  return (
    <div className={styles.properties}>
      <div className={styles.propertiesHeader}>
        <h3 className={styles.sectionTitle} style={{ margin: 0 }}>
          {el.type.charAt(0).toUpperCase() + el.type.slice(1)} Properties
        </h3>
        <button
          className={styles.deleteBtn}
          onClick={() => removeElement(el.id)}
          title="Delete element"
        >
          <Trash2 size={15} />
        </button>
      </div>

      <div className={styles.propGrid}>
        {/* Position */}
        <Input
          label="X (mm)"
          type="number"
          value={el.x.toFixed(1)}
          onChange={(e) => update({ x: parseFloat(e.target.value) || 0 })}
        />
        <Input
          label="Y (mm)"
          type="number"
          value={el.y.toFixed(1)}
          onChange={(e) => update({ y: parseFloat(e.target.value) || 0 })}
        />

        {/* Text properties */}
        {el.type === 'text' && (
          <>
            <div className={styles.fullWidth}>
              <Input
                label="Content"
                value={el.content}
                onChange={(e) => update({ content: e.target.value })}
              />
            </div>
            <div className={styles.selectField}>
              <label className={styles.propLabel}>Font Size</label>
              <div className={styles.selectWrapper}>
                <select
                  className={styles.select}
                  value={el.fontSize}
                  onChange={(e) => update({ fontSize: e.target.value as FontSize })}
                >
                  <option value="1">1 (Smallest - 8×12 dots)</option>
                  <option value="2">2 (Small - 12×20 dots)</option>
                  <option value="3">3 (Medium - 16×24 dots)</option>
                  <option value="4">4 (Large - 24×32 dots)</option>
                  <option value="5">5 (Extra Large - 32×48 dots)</option>
                </select>
                <ChevronDown size={14} className={styles.selectIcon} />
              </div>
            </div>
            <div className={styles.checkboxField}>
              <label>
                <input
                  type="checkbox"
                  checked={el.bold}
                  onChange={(e) => update({ bold: e.target.checked })}
                />
                Bold (2× Multiplier)
              </label>
            </div>
          </>
        )}

        {/* Barcode properties */}
        {el.type === 'barcode' && (
          <>
            <div className={styles.fullWidth}>
              <Input
                label="Barcode Value"
                value={el.content}
                onChange={(e) => update({ content: e.target.value })}
              />
            </div>
            <div className={styles.selectField}>
              <label className={styles.propLabel}>Type</label>
              <div className={styles.selectWrapper}>
                <select
                  className={styles.select}
                  value={el.barcodeType}
                  onChange={(e) => update({ barcodeType: e.target.value as BarcodeType })}
                >
                  <option value="CODE128">Code 128 (Alphanumeric)</option>
                  <option value="CODE39">Code 39</option>
                  <option value="EAN13">EAN-13 (Retail)</option>
                  <option value="EAN8">EAN-8</option>
                  <option value="UPC-A">UPC-A</option>
                  <option value="ITF">ITF-14 (Interleaved 2 of 5)</option>
                  <option value="CODABAR">Codabar</option>
                </select>
                <ChevronDown size={14} className={styles.selectIcon} />
              </div>
            </div>
            <Input
              label="Height (mm)"
              type="number"
              value={el.height}
              onChange={(e) => update({ height: parseFloat(e.target.value) || 10 })}
            />
            <div className={styles.checkboxField}>
              <label>
                <input
                  type="checkbox"
                  checked={el.showText}
                  onChange={(e) => update({ showText: e.target.checked })}
                />
                Show Human-Readable Text
              </label>
            </div>
          </>
        )}

        {/* QR properties */}
        {el.type === 'qrcode' && (
          <>
            <div className={styles.fullWidth}>
              <Input
                label="QR Content (URL or Text)"
                value={el.content}
                onChange={(e) => update({ content: e.target.value })}
              />
            </div>
            <Input
              label="Size (mm)"
              type="number"
              min={10}
              max={80}
              value={el.size}
              onChange={(e) => update({ size: parseFloat(e.target.value) || 20 })}
            />
            <div className={styles.selectField}>
              <label className={styles.propLabel}>Error Correction</label>
              <div className={styles.selectWrapper}>
                <select
                  className={styles.select}
                  value={el.errorCorrection}
                  onChange={(e) => update({ errorCorrection: e.target.value as any })}
                >
                  <option value="L">L (7% Recovery)</option>
                  <option value="M">M (15% Recovery - Standard)</option>
                  <option value="Q">Q (25% Recovery)</option>
                  <option value="H">H (30% Recovery - High)</option>
                </select>
                <ChevronDown size={14} className={styles.selectIcon} />
              </div>
            </div>
          </>
        )}

        {/* Line properties */}
        {el.type === 'line' && (
          <>
            <Input
              label="Width (mm)"
              type="number"
              value={el.width.toFixed(1)}
              onChange={(e) => update({ width: parseFloat(e.target.value) || 10 })}
            />
            <Input
              label="Thickness (px)"
              type="number"
              min={1}
              max={20}
              value={el.thickness}
              onChange={(e) => update({ thickness: parseInt(e.target.value) || 1 })}
            />
          </>
        )}

        {/* Box properties */}
        {el.type === 'box' && (
          <>
            <Input
              label="Width (mm)"
              type="number"
              value={el.width.toFixed(1)}
              onChange={(e) => update({ width: parseFloat(e.target.value) || 10 })}
            />
            <Input
              label="Height (mm)"
              type="number"
              value={el.height.toFixed(1)}
              onChange={(e) => update({ height: parseFloat(e.target.value) || 10 })}
            />
            <Input
              label="Border (px)"
              type="number"
              min={1}
              max={20}
              value={el.thickness}
              onChange={(e) => update({ thickness: parseInt(e.target.value) || 1 })}
            />
          </>
        )}

        {/* Rotation */}
        <div className={styles.fullWidth}>
          <Input
            label="Rotation (°)"
            type="number"
            min={0}
            max={360}
            step={90}
            value={el.rotation ?? 0}
            onChange={(e) => update({ rotation: parseInt(e.target.value) || 0 })}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Route component ──────────────────────────────────────────────────────────
function Designer() {
  const { labelSize, elements } = useDesignerStore();
  const [printPreviewOpen, setPrintPreviewOpen] = useState(false);
  const [connectModalOpen, setConnectModalOpen] = useState(false);

  return (
    <div className={styles.layout}>
      <ToolSidebar
        onOpenPrintPreview={() => setPrintPreviewOpen(true)}
        onOpenConnectModal={() => setConnectModalOpen(true)}
      />
      <div className={styles.canvasArea}>
        <div className={styles.canvasHeader}>
          <div>
            <h2 className={styles.canvasTitle}>Label Canvas</h2>
            <span className={styles.canvasHint}>
              Drag elements to reposition • Select to edit properties • {elements.length} item{elements.length === 1 ? '' : 's'}
            </span>
          </div>
          <Button variant="primary" size="sm" onClick={() => setPrintPreviewOpen(true)}>
            <Printer size={15} style={{ marginRight: 6 }} /> Print Preview
          </Button>
        </div>
        <DesignerCanvas />
      </div>
      <PropertiesPanel />

      {/* Modals */}
      <PrintPreviewModal
        open={printPreviewOpen}
        onClose={() => setPrintPreviewOpen(false)}
        document={{ size: labelSize, elements }}
        onOpenConnectModal={() => {
          setPrintPreviewOpen(false);
          setConnectModalOpen(true);
        }}
      />
      <ConnectPrinterModal
        open={connectModalOpen}
        onClose={() => setConnectModalOpen(false)}
      />
    </div>
  );
}
