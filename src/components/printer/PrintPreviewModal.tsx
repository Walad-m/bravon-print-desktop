import { useState } from 'react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { usePrinterStore } from '../../stores/usePrinterStore';
import { LabelDocument, PrintOptions } from '../../types/label';
import { Printer, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import styles from './PrintPreviewModal.module.css';

interface PrintPreviewModalProps {
  open: boolean;
  onClose: () => void;
  document: LabelDocument;
  onOpenConnectModal: () => void;
}

export function PrintPreviewModal({
  open,
  onClose,
  document,
  onOpenConnectModal,
}: PrintPreviewModalProps) {
  const { connectedDevice, printDocument, isPrinting } =
    usePrinterStore();

  const [copies, setCopies] = useState<number>(1);
  const [density, setDensity] = useState<number>(10);
  const [speed, setSpeed] = useState<number>(3);
  const [paperType, setPaperType] = useState<'gap' | 'continuous' | 'black'>('gap');
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(
    null
  );

  // Compute preview scaling so it fits inside the container
  const maxW = 320;
  const maxH = 430;
  const scale = Math.min(maxW / document.size.width, maxH / document.size.height, 3.5);
  const paperW = Math.round(document.size.width * scale);
  const paperH = Math.round(document.size.height * scale);

  const handlePrint = async () => {
    if (!connectedDevice) {
      onOpenConnectModal();
      return;
    }

    setFeedbackMsg(null);
    try {
      const options: PrintOptions = {
        copies,
        density,
        speed,
        paperType,
      };

      await printDocument(document, options);
      setFeedbackMsg({ text: `Label printed successfully! (${copies} copies)`, type: 'success' });
      setTimeout(() => {
        onClose();
        setFeedbackMsg(null);
      }, 1500);
    } catch (err) {
      setFeedbackMsg({ text: `Failed to print: ${String(err)}`, type: 'error' });
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title="Print Label"
      description="Preview and configure label output before sending to your thermal printer."
      maxWidth="840px"
    >
      <div className={styles.container}>
        {/* Left Column: Visual Label Preview */}
        <div className={styles.previewColumn}>
          <div className={styles.previewHeaderBar}>
            <span className={styles.previewLabelInfo}>
              {document.size.name} ({document.size.width}×{document.size.height}mm)
            </span>
            <span className={styles.scaleBadge}>{Math.round((scale / 3.78) * 100)}% scale</span>
          </div>

          <div className={styles.paperStage}>
            <div
              className={styles.labelPaper}
              style={{
                width: `${paperW}px`,
                height: `${paperH}px`,
              }}
            >
              {document.elements.map((el) => {
                const x = el.x * scale;
                const y = el.y * scale;

                if (el.type === 'text') {
                  const fontSizes: Record<string, number> = {
                    '1': Math.max(7, Math.round(1.9 * scale)),
                    '2': Math.max(8.5, Math.round(2.5 * scale)),
                    '3': Math.max(10, Math.round(3.3 * scale)),
                    '4': Math.max(12, Math.round(4.4 * scale)),
                    '5': Math.max(15, Math.round(5.8 * scale)),
                  };
                  const fs = fontSizes[el.fontSize] || Math.round(2.5 * scale);
                  const elementW = el.width ? el.width * scale : undefined;
                  const maxWLimit = (document.size.width - el.x) * scale;

                  return (
                    <div
                      key={el.id}
                      className={styles.previewElement}
                      style={{
                        left: `${x}px`,
                        top: `${y}px`,
                        width: elementW ? `${elementW}px` : undefined,
                        maxWidth: `${maxWLimit}px`,
                        fontSize: `${fs}px`,
                        fontWeight: el.bold ? 700 : 400,
                        fontFamily: 'monospace, "Courier New", sans-serif',
                        whiteSpace: 'pre-wrap',
                        lineHeight: 1.15,
                        color: '#000000',
                        overflow: 'hidden',
                        transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
                        transformOrigin: 'top left',
                      }}
                    >
                      {el.content}
                    </div>
                  );
                }

                if (el.type === 'barcode') {
                  const bw = (el.width || 40) * scale;
                  const bh = el.height * scale;
                  const contentStr = el.content || '12345678';

                  // Generate realistic dense 1D barcode bars based on content hash
                  let hash = 0;
                  for (let i = 0; i < contentStr.length; i++) {
                    hash = (hash << 5) - hash + contentStr.charCodeAt(i);
                    hash |= 0;
                  }
                  let current = Math.abs(hash) || 982341;
                  const barWidths = [2, 1, 2, 1]; // Start guard
                  for (let i = 0; i < 38; i++) {
                    barWidths.push((current % 3) + 1);
                    current = (current * 16807) % 2147483647;
                  }
                  barWidths.push(2, 1, 3); // Stop guard

                  let cursor = 0;
                  const barRects = [];
                  for (let i = 0; i < barWidths.length; i++) {
                    const w = barWidths[i];
                    if (i % 2 === 0) {
                      barRects.push(
                        <rect key={i} x={cursor} y={0} width={w} height={30} fill="#000000" />
                      );
                    }
                    cursor += w;
                  }

                  return (
                    <div
                      key={el.id}
                      className={styles.previewElement}
                      style={{
                        left: `${x}px`,
                        top: `${y}px`,
                        width: `${bw}px`,
                        height: `${bh}px`,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        overflow: 'hidden',
                      }}
                    >
                      <svg
                        width="100%"
                        height={el.showText ? '75%' : '100%'}
                        preserveAspectRatio="none"
                        viewBox={`0 0 ${cursor} 30`}
                      >
                        {barRects}
                      </svg>
                      {el.showText && (
                        <span
                          style={{
                            fontSize: `${Math.max(8, Math.round(1.9 * scale))}px`,
                            fontFamily: 'monospace',
                            color: '#000',
                            letterSpacing: '0.5px',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            maxWidth: '100%',
                            textAlign: 'center',
                            lineHeight: 1,
                            marginTop: 1,
                          }}
                        >
                          {el.content}
                        </span>
                      )}
                    </div>
                  );
                }

                if (el.type === 'qrcode') {
                  const qSize = el.size * scale;
                  return (
                    <div
                      key={el.id}
                      className={styles.previewElement}
                      style={{
                        left: `${x}px`,
                        top: `${y}px`,
                        width: `${qSize}px`,
                        height: `${qSize}px`,
                        border: '1px solid #000',
                        padding: '2px',
                        backgroundColor: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxSizing: 'border-box',
                      }}
                    >
                      <svg width="100%" height="100%" viewBox="0 0 24 24" fill="#000">
                        <path d="M2 2h7v7H2V2zm2 2v3h3V4H4zm11-2h7v7h-7V2zm2 2v3h3V4h-3zM2 15h7v7H2v-7zm2 2v3h3v-3H4zm13-2h2v2h-2v-2zm-2 2h2v2h-2v-2zm4 0h2v2h-2v-2zm-2 2h2v2h-2v-2zm-2 2h2v2h-2v-2zm4 0h2v2h-2v-2zM11 2h2v4h-2V2zm0 6h2v2h-2V8zm0 4h2v2h-2v-2zm-4 1h2v2H7v-2zm4 2h2v2h-2v-2zm-2 2h2v2H9v-2zm2 2h2v2h-2v-2z" />
                      </svg>
                    </div>
                  );
                }

                if (el.type === 'line') {
                  return (
                    <div
                      key={el.id}
                      className={styles.previewElement}
                      style={{
                        left: `${x}px`,
                        top: `${y}px`,
                        width: `${el.width * scale}px`,
                        height: `${Math.max(1, Math.round((el.thickness || 2) * (scale / 4)))}px`,
                        backgroundColor: '#000000',
                      }}
                    />
                  );
                }

                if (el.type === 'box') {
                  const borderPx = Math.max(1, Math.round((el.thickness || 2) * (scale / 4)));
                  return (
                    <div
                      key={el.id}
                      className={styles.previewElement}
                      style={{
                        left: `${x}px`,
                        top: `${y}px`,
                        width: `${el.width * scale}px`,
                        height: `${el.height * scale}px`,
                        border: `${borderPx}px solid #000000`,
                        backgroundColor: 'transparent',
                        boxSizing: 'border-box',
                      }}
                    />
                  );
                }

                return null;
              })}
            </div>
          </div>
        </div>

        {/* Right Column: Print Options & Controls */}
        <div className={styles.optionsColumn}>
          {/* Target Printer Card */}
          <div className={styles.printerCard}>
            <div className={styles.printerLeft}>
              <Printer size={18} color="var(--color-primary)" />
              <div>
                <div className={styles.printerName}>
                  {connectedDevice ? connectedDevice.name : 'No printer selected'}
                </div>
                <div className={styles.printerSub}>
                  {connectedDevice
                    ? connectedDevice.detail
                    : 'Click Change to pick a USB or COM printer'}
                </div>
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={onOpenConnectModal}>
              Change
            </Button>
          </div>

          {/* Copies */}
          <div className={styles.fieldGroup}>
            <span className={styles.fieldLabel}>Copies</span>
            <div className={styles.copiesRow}>
              <button
                className={styles.copyBtn}
                onClick={() => setCopies((c) => Math.max(1, c - 1))}
              >
                −
              </button>
              <input
                type="number"
                min="1"
                max="999"
                className={styles.copyInput}
                value={copies}
                onChange={(e) => setCopies(Math.max(1, parseInt(e.target.value) || 1))}
              />
              <button
                className={styles.copyBtn}
                onClick={() => setCopies((c) => Math.min(999, c + 1))}
              >
                +
              </button>
            </div>
          </div>

          {/* Thermal Darkness / Density */}
          <div className={styles.fieldGroup}>
            <div className={styles.fieldLabel}>
              <span>Darkness (Density)</span>
              <span className={styles.fieldVal}>{density} / 15</span>
            </div>
            <input
              type="range"
              min="1"
              max="15"
              className={styles.slider}
              value={density}
              onChange={(e) => setDensity(Number(e.target.value))}
            />
          </div>

          {/* Print Speed */}
          <div className={styles.fieldGroup}>
            <span className={styles.fieldLabel}>Print Speed</span>
            <select
              className={styles.selectInput}
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
            >
              <option value={2}>2.0 in/sec (Highest quality)</option>
              <option value={3}>3.0 in/sec (Balanced - recommended)</option>
              <option value={4}>4.0 in/sec (Fast)</option>
              <option value={5}>5.0 in/sec (Maximum speed)</option>
            </select>
          </div>

          {/* Paper Type */}
          <div className={styles.fieldGroup}>
            <span className={styles.fieldLabel}>Paper Media Type</span>
            <select
              className={styles.selectInput}
              value={paperType}
              onChange={(e) => setPaperType(e.target.value as any)}
            >
              <option value="gap">Die-Cut Gap Labels (Standard)</option>
              <option value="continuous">Continuous Thermal Paper Roll</option>
              <option value="black">Black Mark (Bline) Labels</option>
            </select>
          </div>

          {/* Inline Feedback Banner */}
          {feedbackMsg && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 12px',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.85rem',
                backgroundColor:
                  feedbackMsg.type === 'success'
                    ? 'rgba(16, 185, 129, 0.1)'
                    : 'rgba(239, 68, 68, 0.1)',
                color:
                  feedbackMsg.type === 'success' ? 'var(--color-success)' : 'var(--color-error)',
              }}
            >
              {feedbackMsg.type === 'success' ? (
                <CheckCircle2 size={16} />
              ) : (
                <AlertCircle size={16} />
              )}
              <span>{feedbackMsg.text}</span>
            </div>
          )}

          {/* Action Row */}
          <div className={styles.actionRow}>
            <Button variant="secondary" onClick={onClose} disabled={isPrinting}>
              Cancel
            </Button>
            <Button
              variant="primary"
              className={styles.printButton}
              onClick={handlePrint}
              disabled={isPrinting}
            >
              {isPrinting ? (
                <>
                  <Loader2 size={16} className={styles.spinIcon} style={{ marginRight: 8 }} />
                  Printing…
                </>
              ) : (
                <>
                  <Printer size={16} style={{ marginRight: 8 }} />
                  Print Now
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
