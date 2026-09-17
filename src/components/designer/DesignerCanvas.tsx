import React, { useRef, useEffect, useCallback } from 'react';
import { Stage, Layer, Rect, Text, Image as KonvaImage, Transformer, Line } from 'react-konva';
import Konva from 'konva';
import { useDesignerStore } from '../../stores/useDesignerStore';
import { LabelElement, PX_PER_MM } from '../../types/label';
import styles from './DesignerCanvas.module.css';

// ─── Barcode rendering via bwip-js ──────────────────────────────────────────
async function renderBarcodeToDataUrl(
  data: string,
  bcid: string,
  widthPx: number,
  heightPx: number,
  includeText: boolean
): Promise<HTMLImageElement | null> {
  try {
    const bwipjs = await import('bwip-js');
    const canvas = document.createElement('canvas');
    bwipjs.default.toCanvas(canvas, {
      bcid,
      text: data,
      scale: 2,
      height: Math.max(5, Math.round(heightPx / 10)),
      width: Math.max(10, Math.round(widthPx / 4)),
      includetext: includeText,
      textxalign: 'center',
    });
    const img = new window.Image();
    img.src = canvas.toDataURL();
    await new Promise((res) => { img.onload = res; });
    return img;
  } catch {
    return null;
  }
}

// Map our barcode type strings to bwip-js bcid strings
const BWIP_TYPE_MAP: Record<string, string> = {
  'CODE128': 'code128',
  'CODE39': 'code39',
  'EAN13': 'ean13',
  'EAN8': 'ean8',
  'UPC-A': 'upca',
  'ITF': 'interleaved2of5',
  'CODABAR': 'codabar',
};

// ─── QR Code rendering via qrcode lib ───────────────────────────────────────
async function renderQRToImage(data: string, sizePx: number): Promise<HTMLImageElement | null> {
  try {
    const QRCode = await import('qrcode');
    const dataUrl = await QRCode.default.toDataURL(data, {
      width: sizePx,
      margin: 1,
      errorCorrectionLevel: 'M',
    });
    const img = new window.Image();
    img.src = dataUrl;
    await new Promise((res) => { img.onload = res; });
    return img;
  } catch {
    return null;
  }
}

// ─── Individual element renderers ────────────────────────────────────────────
const BarcodeNode: React.FC<{
  el: Extract<LabelElement, { type: 'barcode' }>;
  isSelected: boolean;
  onSelect: () => void;
  onChange: (updates: Partial<Extract<LabelElement, { type: 'barcode' }>>) => void;
}> = ({ el, isSelected, onSelect, onChange }) => {
  const [image, setImage] = React.useState<HTMLImageElement | null>(null);
  const widthPx = el.width * PX_PER_MM;
  const heightPx = el.height * PX_PER_MM;

  useEffect(() => {
    const bcid = BWIP_TYPE_MAP[el.barcodeType] ?? 'code128';
    renderBarcodeToDataUrl(el.content || 'PREVIEW', bcid, widthPx, heightPx, el.showText).then(setImage);
  }, [el.content, el.barcodeType, el.showText, widthPx, heightPx]);

  if (!image) {
    return (
      <Rect
        x={el.x * PX_PER_MM} y={el.y * PX_PER_MM}
        width={widthPx} height={heightPx}
        fill="#f0f0f0" stroke={isSelected ? '#7C3AED' : '#888'}
        strokeWidth={isSelected ? 2 : 1}
        draggable
        onClick={onSelect}
        onDragEnd={(e) => onChange({ x: e.target.x() / PX_PER_MM, y: e.target.y() / PX_PER_MM })}
      />
    );
  }

  return (
    <KonvaImage
      image={image}
      x={el.x * PX_PER_MM} y={el.y * PX_PER_MM}
      width={widthPx} height={heightPx}
      draggable
      onClick={onSelect}
      stroke={isSelected ? '#7C3AED' : undefined}
      strokeWidth={isSelected ? 2 : 0}
      onDragEnd={(e) => onChange({ x: e.target.x() / PX_PER_MM, y: e.target.y() / PX_PER_MM })}
      onTransformEnd={(e) => {
        const node = e.target;
        onChange({
          x: node.x() / PX_PER_MM,
          y: node.y() / PX_PER_MM,
          width: (node.width() * node.scaleX()) / PX_PER_MM,
          height: (node.height() * node.scaleY()) / PX_PER_MM,
        });
        node.scaleX(1);
        node.scaleY(1);
      }}
    />
  );
};

const QRNode: React.FC<{
  el: Extract<LabelElement, { type: 'qrcode' }>;
  isSelected: boolean;
  onSelect: () => void;
  onChange: (updates: Partial<Extract<LabelElement, { type: 'qrcode' }>>) => void;
}> = ({ el, isSelected, onSelect, onChange }) => {
  const [image, setImage] = React.useState<HTMLImageElement | null>(null);
  const sizePx = el.size * PX_PER_MM;

  useEffect(() => {
    renderQRToImage(el.content || 'https://example.com', sizePx).then(setImage);
  }, [el.content, sizePx]);

  const placeholder = (
    <Rect
      x={el.x * PX_PER_MM} y={el.y * PX_PER_MM}
      width={sizePx} height={sizePx}
      fill="#e8e8e8" stroke={isSelected ? '#7C3AED' : '#888'}
      strokeWidth={isSelected ? 2 : 1}
      draggable onClick={onSelect}
      onDragEnd={(e) => onChange({ x: e.target.x() / PX_PER_MM, y: e.target.y() / PX_PER_MM })}
    />
  );

  if (!image) return placeholder;

  return (
    <KonvaImage
      image={image}
      x={el.x * PX_PER_MM} y={el.y * PX_PER_MM}
      width={sizePx} height={sizePx}
      draggable onClick={onSelect}
      stroke={isSelected ? '#7C3AED' : undefined}
      strokeWidth={isSelected ? 2 : 0}
      onDragEnd={(e) => onChange({ x: e.target.x() / PX_PER_MM, y: e.target.y() / PX_PER_MM })}
      onTransformEnd={(e) => {
        const node = e.target;
        const newSize = Math.max(5, (node.width() * node.scaleX()) / PX_PER_MM);
        onChange({ x: node.x() / PX_PER_MM, y: node.y() / PX_PER_MM, size: newSize });
        node.scaleX(1); node.scaleY(1);
      }}
    />
  );
};

// ─── Main DesignerCanvas ─────────────────────────────────────────────────────
export const DesignerCanvas: React.FC = () => {
  const { elements, canvasWidth, canvasHeight, selectedElementId, setSelectedElement, updateElement } = useDesignerStore();
  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<Konva.Transformer>(null);

  // Attach transformer to the selected node
  useEffect(() => {
    if (!transformerRef.current || !stageRef.current) return;
    const transformer = transformerRef.current;
    if (selectedElementId) {
      const node = stageRef.current.findOne(`#${selectedElementId}`);
      if (node) {
        transformer.nodes([node]);
      } else {
        transformer.nodes([]);
      }
    } else {
      transformer.nodes([]);
    }
    transformer.getLayer()?.batchDraw();
  }, [selectedElementId, elements]);

  const handleSelect = useCallback((id: string) => setSelectedElement(id), [setSelectedElement]);

  const handleUpdate = useCallback(
    (id: string, updates: Partial<LabelElement>) => updateElement(id, updates),
    [updateElement]
  );

  return (
    <div className={styles.canvasWrapper}>
      <div className={styles.canvasShadow} style={{ width: canvasWidth, height: canvasHeight }}>
        <Stage
          ref={stageRef}
          width={canvasWidth}
          height={canvasHeight}
          onMouseDown={(e) => {
            if (e.target === e.target.getStage()) setSelectedElement(null);
          }}
        >
          <Layer>
            {/* White label background */}
            <Rect x={0} y={0} width={canvasWidth} height={canvasHeight} fill="white" />

            {/* Render elements */}
            {elements.map((el) => {
              const isSelected = el.id === selectedElementId;

              if (el.type === 'text') {
                const fontSizeMap: Record<string, number> = { '1': 10, '2': 14, '3': 18, '4': 24, '5': 32 };
                const fs = fontSizeMap[el.fontSize] ?? 14;
                return (
                  <Text
                    key={el.id}
                    id={el.id}
                    x={el.x * PX_PER_MM}
                    y={el.y * PX_PER_MM}
                    text={el.content}
                    fontSize={fs}
                    fontStyle={el.bold ? 'bold' : 'normal'}
                    fill="black"
                    draggable
                    rotation={el.rotation ?? 0}
                    onClick={() => handleSelect(el.id)}
                    onDragEnd={(e) =>
                      handleUpdate(el.id, { x: e.target.x() / PX_PER_MM, y: e.target.y() / PX_PER_MM })
                    }
                    onTransformEnd={(e) => {
                      const node = e.target;
                      handleUpdate(el.id, {
                        x: node.x() / PX_PER_MM,
                        y: node.y() / PX_PER_MM,
                      });
                    }}
                  />
                );
              }

              if (el.type === 'barcode') {
                return (
                  <BarcodeNode
                    key={el.id}
                    el={el}
                    isSelected={isSelected}
                    onSelect={() => handleSelect(el.id)}
                    onChange={(u) => handleUpdate(el.id, u)}
                  />
                );
              }

              if (el.type === 'qrcode') {
                return (
                  <QRNode
                    key={el.id}
                    el={el}
                    isSelected={isSelected}
                    onSelect={() => handleSelect(el.id)}
                    onChange={(u) => handleUpdate(el.id, u)}
                  />
                );
              }

              if (el.type === 'line') {
                return (
                  <Line
                    key={el.id}
                    id={el.id}
                    x={el.x * PX_PER_MM}
                    y={el.y * PX_PER_MM}
                    points={[0, 0, el.width * PX_PER_MM, 0]}
                    stroke="black"
                    strokeWidth={el.thickness}
                    draggable
                    onClick={() => handleSelect(el.id)}
                    onDragEnd={(e) =>
                      handleUpdate(el.id, { x: e.target.x() / PX_PER_MM, y: e.target.y() / PX_PER_MM })
                    }
                  />
                );
              }

              if (el.type === 'box') {
                return (
                  <Rect
                    key={el.id}
                    id={el.id}
                    x={el.x * PX_PER_MM}
                    y={el.y * PX_PER_MM}
                    width={el.width * PX_PER_MM}
                    height={el.height * PX_PER_MM}
                    stroke="black"
                    strokeWidth={el.thickness}
                    fill="transparent"
                    draggable
                    onClick={() => handleSelect(el.id)}
                    onDragEnd={(e) =>
                      handleUpdate(el.id, { x: e.target.x() / PX_PER_MM, y: e.target.y() / PX_PER_MM })
                    }
                    onTransformEnd={(e) => {
                      const node = e.target;
                      handleUpdate(el.id, {
                        x: node.x() / PX_PER_MM,
                        y: node.y() / PX_PER_MM,
                        width: (node.width() * node.scaleX()) / PX_PER_MM,
                        height: (node.height() * node.scaleY()) / PX_PER_MM,
                      });
                      node.scaleX(1); node.scaleY(1);
                    }}
                  />
                );
              }

              return null;
            })}

            {/* Konva Transformer (resize handles) */}
            <Transformer
              ref={transformerRef}
              boundBoxFunc={(oldBox, newBox) => {
                if (newBox.width < 10 || newBox.height < 10) return oldBox;
                return newBox;
              }}
              borderStroke="#7C3AED"
              anchorStroke="#7C3AED"
              anchorFill="white"
              anchorSize={8}
            />
          </Layer>
        </Stage>
      </div>
    </div>
  );
};
