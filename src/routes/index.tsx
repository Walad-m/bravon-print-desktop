import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState, useEffect } from 'react';
import {
  Printer,
  Bluetooth,
  Play,
  Settings2,
  Plus,
  AlertCircle,
  CheckCircle2,
  FileText,
  Layers,
  ArrowRight,
  ArrowDown,
} from 'lucide-react';
import { Button } from '../components/ui/Button';
import { usePrinterStore } from '../stores/usePrinterStore';
import { useDesignerStore } from '../stores/useDesignerStore';
import { ConnectPrinterModal } from '../components/printer/ConnectPrinterModal';
import { LABEL_TEMPLATES } from '../data/templates';
import { PRESET_LABEL_SIZES, LabelTemplate, LabelSize } from '../types/label';
import styles from './index.module.css';

export const Route = createFileRoute('/')({
  component: Dashboard,
});

function Dashboard() {
  const navigate = useNavigate();
  const {
    connectedDevice,
    baudRate,
    isScanning,
    isConnecting,
    isPrinting,
    lastError,
    lastSuccessMessage,
    scanDevices,
    autoDetectPrinter,
    testPrint,
    feedLabel,
    clearError,
    clearSuccessMessage,
  } = usePrinterStore();

  const { loadTemplate, setLabelSize, clearAll } = useDesignerStore();

  const [connectModalOpen, setConnectModalOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  useEffect(() => {
    // Initial scan on mount if no devices scanned yet
    scanDevices();
  }, []);

  const handleOpenTemplate = (template: LabelTemplate) => {
    loadTemplate(template);
    navigate({ to: '/designer' });
  };

  const handleStartBlank = (size: LabelSize) => {
    setLabelSize(size);
    clearAll();
    navigate({ to: '/designer' });
  };

  const filteredTemplates =
    selectedCategory === 'all'
      ? LABEL_TEMPLATES
      : LABEL_TEMPLATES.filter((t) => t.category === selectedCategory);

  const categories = [
    { id: 'all', label: 'All Templates' },
    { id: 'retail', label: 'Retail & Pricing' },
    { id: 'shipping', label: 'Shipping & Logistics' },
    { id: 'inventory', label: 'Warehouse & Asset' },
    { id: 'food', label: 'Food & Deli' },
    { id: 'medical', label: 'Medical & Lab' },
    { id: 'office', label: 'Badges & Office' },
    { id: 'warning', label: 'Warning & Handling' },
  ];

  return (
    <div className={styles.page}>
      {/* Page Header */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Bravon Print Desktop</h1>
          <p className={styles.subtitle}>
            Industrial thermal label printing via official manufacturer driver &amp; Bluetooth SPP.
          </p>
        </div>
        <div className={styles.headerActions}>
          <Button variant="secondary" onClick={() => setConnectModalOpen(true)}>
            <Settings2 size={16} style={{ marginRight: 6 }} /> Configure Ports
          </Button>
          <Button variant="primary" onClick={() => handleStartBlank(PRESET_LABEL_SIZES[0])}>
            <Plus size={16} style={{ marginRight: 6 }} /> New Label
          </Button>
        </div>
      </div>

      {/* Error / Success Notifications */}
      {lastError && (
        <div className={styles.errorBanner}>
          <AlertCircle size={18} />
          <span>{lastError}</span>
          <button onClick={clearError} className={styles.bannerClose}>
            ✕
          </button>
        </div>
      )}
      {lastSuccessMessage && (
        <div className={styles.successBanner}>
          <CheckCircle2 size={18} />
          <span>{lastSuccessMessage}</span>
          <button onClick={clearSuccessMessage} className={styles.bannerClose}>
            ✕
          </button>
        </div>
      )}

      {/* Printer Status Banner */}
      <div
        className={`${styles.statusCard} ${
          connectedDevice ? styles.statusCardActive : styles.statusCardEmpty
        }`}
      >
        <div className={styles.statusLeft}>
          <div
            className={`${styles.statusIconBox} ${
              connectedDevice
                ? (connectedDevice.jobCount || 0) > 0
                  ? styles.statusIconWarning
                  : styles.statusIconSuccess
                : styles.statusIconWarning
            }`}
          >
            {connectedDevice?.deviceType === 'spooler' ? (
              <Printer size={26} />
            ) : (
              <Bluetooth size={26} />
            )}
          </div>
          <div className={styles.statusInfo}>
            <div className={styles.statusNameRow}>
              <span className={styles.statusTitle}>
                {connectedDevice ? connectedDevice.name : 'No Thermal Printer Connected'}
              </span>
              {connectedDevice && (
                <>
                  <span
                    className={`${styles.badge} ${
                      connectedDevice.deviceType === 'spooler'
                        ? styles.badgeSpooler
                        : styles.badgeSerial
                    }`}
                  >
                    {connectedDevice.deviceType === 'spooler'
                      ? 'USB Windows Driver'
                      : `Bluetooth SPP (${baudRate} baud)`}
                  </span>
                  {(connectedDevice.jobCount || 0) > 0 && (
                    <span
                      style={{
                        backgroundColor: 'rgba(239, 68, 68, 0.15)',
                        color: 'var(--color-error)',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: '4px',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                      }}
                    >
                      ⚠️ {connectedDevice.jobCount} Stuck Job(s)
                    </span>
                  )}
                </>
              )}
            </div>
            <span className={styles.statusSubtitle}>
              {connectedDevice
                ? (connectedDevice.jobCount || 0) > 0
                  ? `Windows queue is holding ${connectedDevice.jobCount} stuck job(s). Click 'Clear Queue' or configure ports.`
                  : `${connectedDevice.detail} • Ready to print`
                : 'Connect via Bluetooth SPP (COM Port) or official USB Windows Driver (LABEL).'}
            </span>
          </div>
        </div>

        <div className={styles.statusRight}>
          {connectedDevice ? (
            <>
              {(connectedDevice.jobCount || 0) > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => usePrinterStore.getState().clearPrinterQueue()}
                >
                  Clear Queue
                </Button>
              )}
              <Button
                variant="secondary"
                size="sm"
                onClick={testPrint}
                disabled={isPrinting}
              >
                <Play size={14} style={{ marginRight: 6 }} />
                {isPrinting ? 'Sending Test…' : 'Send Test Label'}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={feedLabel}
                disabled={isPrinting}
                title="Feed one label / calibrate sensor"
              >
                <ArrowDown size={14} style={{ marginRight: 6 }} />
                Feed 1 Label
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setConnectModalOpen(true)}
              >
                Switch Device
              </Button>
            </>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <Button
                variant="primary"
                onClick={async () => {
                  await autoDetectPrinter();
                }}
                disabled={isConnecting || isScanning}
              >
                <Printer size={16} style={{ marginRight: 6 }} />
                {isConnecting ? 'Detecting…' : '⚡ 1-Click Connect'}
              </Button>
              <Button variant="secondary" onClick={() => setConnectModalOpen(true)}>
                Select Port
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Templates Section */}
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <h2 className={styles.sectionTitle}>Label Templates</h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginTop: 2 }}>
              Choose a proven template or start with standardized industry dimensions.
            </p>
          </div>

          {/* Filter Chips */}
          <div className={styles.filterRow}>
            {categories.map((c) => (
              <button
                key={c.id}
                className={`${styles.filterBtn} ${
                  selectedCategory === c.id ? styles.filterBtnActive : ''
                }`}
                onClick={() => setSelectedCategory(c.id)}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* Template Grid */}
        <div className={styles.templateGrid}>
          {filteredTemplates.map((template) => (
            <div key={template.id} className={styles.templateCard}>
              <div>
                <div className={styles.cardTop}>
                  <span className={styles.templateName}>{template.name}</span>
                  <span className={styles.sizeBadge}>{template.size.name.split(' ')[0]}</span>
                </div>
                <p className={styles.templateDesc}>{template.description}</p>
              </div>

              <div className={styles.cardBottom}>
                <span className={styles.elementCount}>
                  <Layers size={13} style={{ display: 'inline', marginRight: 4 }} />
                  {template.elements.length} elements
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleOpenTemplate(template)}
                >
                  Customize &amp; Print <ArrowRight size={14} style={{ marginLeft: 4 }} />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Standard Size Presets */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>Blank Canvas Presets</h2>
        <div className={styles.presetsGrid}>
          {PRESET_LABEL_SIZES.filter((s) => s.name !== 'Custom').map((preset) => (
            <button
              key={preset.name}
              className={styles.presetBtn}
              onClick={() => handleStartBlank(preset)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <FileText size={16} color="var(--color-primary)" />
                <span className={styles.presetName}>{preset.name}</span>
              </div>
              <span className={styles.presetDim}>
                {preset.width} × {preset.height} mm (203 DPI)
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Connect Printer Modal */}
      <ConnectPrinterModal
        open={connectModalOpen}
        onClose={() => setConnectModalOpen(false)}
      />
    </div>
  );
}
