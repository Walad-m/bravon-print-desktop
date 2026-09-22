import { useEffect, useState } from 'react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { usePrinterStore } from '../../stores/usePrinterStore';
import {
  Printer,
  Bluetooth,
  RefreshCw,
  CheckCircle2,
  Play,
  Info,
  AlertTriangle,
  ArrowDown,
  ChevronDown,
  ChevronRight,
  Trash2,
  Activity,
  Cable,
  Zap,
  ExternalLink,
  Download,
} from 'lucide-react';
import styles from './ConnectPrinterModal.module.css';

interface ConnectPrinterModalProps {
  open: boolean;
  onClose: () => void;
}

export function ConnectPrinterModal({ open, onClose }: ConnectPrinterModalProps) {
  const {
    discoveredDevices,
    connectedDevice,
    baudRate,
    isScanning,
    isConnecting,
    isPrinting,
    isProbing,
    diagnostic,
    activeQueueJobs,
    scanDevices,
    autoDetectPrinter,
    openBluetoothSettings,
    connectToDevice,
    probeDevice,
    fetchQueue,
    setBaudRate,
    testPrint,
    feedLabel,
    clearPrinterQueue,
    installPrinterDriver,
  } = usePrinterStore();

  const [clearingQueue, setClearingQueue] = useState(false);
  const [showSystemPrinters, setShowSystemPrinters] = useState(false);

  useEffect(() => {
    if (open) {
      scanDevices();
    }
  }, [open]);

  useEffect(() => {
    if (connectedDevice) {
      probeDevice(connectedDevice);
      if (connectedDevice.deviceType === 'spooler') {
        fetchQueue(connectedDevice.printerName || connectedDevice.name);
      }
    }
  }, [connectedDevice?.id]);

  const baudOptions = [9600, 19200, 38400, 57600, 115200];

  const handleClearQueue = async (name?: string) => {
    setClearingQueue(true);
    try {
      await clearPrinterQueue(name);
      if (connectedDevice) {
        await probeDevice(connectedDevice);
        await fetchQueue(connectedDevice.printerName || connectedDevice.name);
      }
    } finally {
      setClearingQueue(false);
    }
  };

  // Separate thermal hardware printers from virtual system printers (PDF, OneNote)
  const thermalDevices = discoveredDevices.filter((d) => d.category !== 'system' && d.isLikelyPrinter);
  const systemDevices = discoveredDevices.filter((d) => d.category === 'system' || !d.isLikelyPrinter);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      title="Connect Thermal Printer"
      description="Connect to your ZJ-9260 thermal label printer via USB Cable or Bluetooth Wireless."
      maxWidth="680px"
    >
      <div className={styles.container}>
        {/* 1-Click Auto-Detect Hero Banner */}
        <div className={styles.autoConnectCard}>
          <div className={styles.autoConnectInfo}>
            <div className={styles.autoConnectTitle}>
              <Zap size={18} className={styles.zapIcon} />
              <span>Zero-Config Quick Connect</span>
            </div>
            <p className={styles.autoConnectSubtitle}>
              Automatically detect connected USB cable or paired Bluetooth link and prepare for printing.
            </p>
          </div>
          <Button
            variant="primary"
            onClick={async () => {
              await autoDetectPrinter();
            }}
            disabled={isConnecting || isScanning}
          >
            <Zap size={15} style={{ marginRight: 6 }} />
            {isConnecting ? 'Detecting…' : '⚡ Auto-Detect & Connect'}
          </Button>
        </div>

        {/* Header summary & Refresh */}
        <div className={styles.headerRow}>
          <span style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
            {discoveredDevices.length} connection{discoveredDevices.length === 1 ? '' : 's'} detected
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button
              variant="secondary"
              size="sm"
              onClick={openBluetoothSettings}
              title="Open Windows Bluetooth Settings to pair your printer"
            >
              <Bluetooth size={14} style={{ marginRight: 5, color: '#2563eb' }} />
              <span style={{ fontSize: '0.8rem' }}>Pair Bluetooth in Windows</span>
              <ExternalLink size={12} style={{ marginLeft: 4, opacity: 0.6 }} />
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={scanDevices}
              disabled={isScanning}
            >
              <RefreshCw
                size={14}
                className={isScanning ? styles.spinIcon : ''}
                style={{ marginRight: 6 }}
              />
              {isScanning ? 'Scanning…' : 'Refresh'}
            </Button>
          </div>
        </div>


        {/* Primary Thermal Devices List */}
        <div>
          <div className={styles.sectionTitle}>
            <Printer size={14} /> Thermal Label &amp; Receipt Hardware
          </div>

          <div className={styles.deviceList}>
            {thermalDevices.length === 0 && !isScanning ? (
              <div className={styles.emptyState}>
                <Printer size={32} style={{ opacity: 0.5, marginBottom: 8 }} />
                <p>No thermal label printers detected.</p>
                {typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent || '') ? (
                  <p style={{ fontSize: '0.8rem', marginTop: 6, marginBottom: 12, color: 'var(--text-muted)' }}>
                    On macOS, make sure your printer is added in <strong>System Settings &gt; Printers &amp; Scanners</strong>. Once added, click <strong>Refresh</strong> above.
                  </p>
                ) : (
                  <>
                    <p style={{ fontSize: '0.8rem', marginTop: 4, marginBottom: 12 }}>
                      Windows requires a driver to talk to USB and Bluetooth thermal printers. 
                      If your printer is plugged in or paired but not showing up, install the driver below.
                    </p>
                    <Button 
                      variant="primary" 
                      onClick={installPrinterDriver}
                      style={{ marginTop: 12 }}
                    >
                      <Download size={15} style={{ marginRight: 6 }} />
                      Install Printer Driver
                    </Button>
                  </>
                )}
              </div>
            ) : (
              thermalDevices.map((device) => {
                const isSelected = connectedDevice?.id === device.id;
                const isSpooler = device.deviceType === 'spooler';
                const hasStuckJobs = (device.jobCount || 0) > 0;

                return (
                  <div
                    key={device.id}
                    className={`${styles.deviceCard} ${isSelected ? styles.deviceCardActive : ''}`}
                    onClick={() => connectToDevice(device)}
                  >
                    <div className={styles.deviceLeft}>
                      <div className={`${styles.iconWrapper} ${isSpooler ? styles.iconSpooler : ''}`}>
                        {isSpooler ? <Cable size={18} /> : <Bluetooth size={18} />}
                      </div>
                      <div className={styles.deviceInfo}>
                        <div className={styles.deviceNameRow}>
                          <span className={styles.deviceName}>{device.name}</span>
                          {device.isRecommended && (
                            <span className={styles.badgeRecommended}>Recommended</span>
                          )}
                          {isSpooler ? (
                            <span className={styles.badgeUsb}>USB Driver</span>
                          ) : (
                            <span className={styles.badgeBt}>Bluetooth SPP</span>
                          )}
                          {hasStuckJobs && (
                            <span className={styles.queueBadge}>
                              <AlertTriangle size={11} /> {device.jobCount} stuck job(s)
                            </span>
                          )}
                        </div>
                        <span className={styles.deviceDetail}>{device.detail}</span>
                      </div>
                    </div>

                    <div className={styles.deviceActions}>
                      {hasStuckJobs && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleClearQueue(device.printerName || device.name);
                          }}
                          disabled={clearingQueue}
                        >
                          <Trash2 size={13} style={{ marginRight: 4 }} />
                          Clear Queue
                        </Button>
                      )}

                      {isSelected ? (
                        <div className={styles.connectedCheck}>
                          <CheckCircle2 size={16} /> Selected
                        </div>
                      ) : (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            connectToDevice(device);
                          }}
                        >
                          Select
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Collapsible System / Virtual Printers */}
        {systemDevices.length > 0 && (
          <div>
            <button
              className={styles.systemPrintersToggle}
              onClick={() => setShowSystemPrinters(!showSystemPrinters)}
            >
              {showSystemPrinters ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              {showSystemPrinters
                ? 'Hide other system printers'
                : `Show ${systemDevices.length} other system printer(s) (PDF, OneNote, etc.)`}
            </button>

            {showSystemPrinters && (
              <div className={styles.deviceList} style={{ marginTop: 6 }}>
                {systemDevices.map((device) => {
                  const isSelected = connectedDevice?.id === device.id;
                  return (
                    <div
                      key={device.id}
                      className={`${styles.deviceCard} ${isSelected ? styles.deviceCardActive : ''}`}
                      onClick={() => connectToDevice(device)}
                    >
                      <div className={styles.deviceLeft}>
                        <div className={`${styles.iconWrapper} ${styles.iconSystem}`}>
                          <Printer size={18} />
                        </div>
                        <div className={styles.deviceInfo}>
                          <span className={styles.deviceName}>{device.name}</span>
                          <span className={styles.deviceDetail}>{device.detail}</span>
                        </div>
                      </div>

                      <div className={styles.deviceActions}>
                        {isSelected ? (
                          <div className={styles.connectedCheck}>
                            <CheckCircle2 size={16} /> Selected
                          </div>
                        ) : (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              connectToDevice(device);
                            }}
                          >
                            Select
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Real-time Selected Printer Health Inspector */}
        {connectedDevice && (
          <div className={styles.inspectorCard}>
            <div className={styles.inspectorHeader}>
              <div className={styles.inspectorTitle}>
                <Activity size={16} color="var(--color-primary)" />
                <span>Live Connection Health: {connectedDevice.name}</span>
              </div>
              <div
                className={`${styles.statusIndicator} ${
                  diagnostic?.reachable && (diagnostic.jobCount === 0 || !diagnostic.jobCount)
                    ? styles.statusReady
                    : (diagnostic?.jobCount || 0) > 0
                    ? styles.statusStuck
                    : styles.statusOffline
                }`}
              >
                {isProbing ? (
                  <>
                    <RefreshCw size={12} className={styles.spinIcon} /> Testing…
                  </>
                ) : diagnostic?.reachable ? (
                  (diagnostic.jobCount || 0) > 0 ? (
                    <>
                      <AlertTriangle size={12} /> {diagnostic.jobCount} Stuck in Spooler
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={12} /> Ready to Print
                    </>
                  )
                ) : (
                  <>
                    <AlertTriangle size={12} /> Device Offline / Unreachable
                  </>
                )}
              </div>
            </div>

            {/* Diagnostic Message */}
            <div
              className={`${styles.diagnosticMessage} ${
                diagnostic?.error ? styles.diagnosticError : ''
              }`}
            >
              {diagnostic?.error ? (
                <div>
                  <strong>Notice: </strong> {diagnostic.error}
                </div>
              ) : diagnostic?.statusText ? (
                <div>{diagnostic.statusText}</div>
              ) : (
                <div>Connection verified. Device is ready for print commands.</div>
              )}
            </div>

            {/* If there are stuck print jobs in the Windows queue, show queue drawer */}
            {connectedDevice.deviceType === 'spooler' && (diagnostic?.jobCount || 0) > 0 && (
              <div className={styles.queueBox}>
                <div className={styles.queueBoxTitle}>
                  <span>⚠️ Stuck Print Queue ({diagnostic?.jobCount} jobs blocking printer)</span>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleClearQueue(connectedDevice.printerName || connectedDevice.name)}
                    disabled={clearingQueue}
                  >
                    <Trash2 size={12} style={{ marginRight: 4 }} />
                    Flush All Stuck Jobs
                  </Button>
                </div>
                {activeQueueJobs.length > 0 && (
                  <div>
                    {activeQueueJobs.map((job) => (
                      <div key={job.id} className={styles.queueItem}>
                        <span>Job #{job.id}: {job.document_name}</span>
                        <span style={{ color: 'var(--color-error)', fontWeight: 600 }}>
                          {job.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Serial Baud Rate Setting (for Bluetooth SPP) */}
            {connectedDevice.deviceType === 'serial' && (
              <div className={styles.serialSettings}>
                <span className={styles.serialLabel}>Baud Rate:</span>
                <select
                  className={styles.baudSelect}
                  value={baudRate}
                  onChange={(e) => {
                    setBaudRate(Number(e.target.value));
                    probeDevice(connectedDevice);
                  }}
                >
                  {baudOptions.map((rate) => (
                    <option key={rate} value={rate}>
                      {rate} baud {rate === 9600 ? '(Default)' : ''}
                    </option>
                  ))}
                </select>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => probeDevice(connectedDevice)}
                  disabled={isProbing}
                >
                  <Activity size={13} style={{ marginRight: 4 }} />
                  Re-Test Connection
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Informative Tip */}
        <div className={styles.tipBox}>
          <Info size={16} style={{ flexShrink: 0, marginTop: 1, color: 'var(--color-primary)' }} />
          <span>
            <strong>Which one should I choose?</strong>
            <br />
            • <strong>USB Cable:</strong> Select <strong>LABEL 3</strong> (official Windows driver on USB001).
            <br />
            • <strong>Bluetooth Wireless:</strong> Pair in Windows Settings &amp; select <strong>COM6 (Bluetooth SPP)</strong>.
            <br />
            • If a label doesn't print, click <strong>Clear Queue</strong> to unblock any stuck jobs in Windows.
          </span>
        </div>

        {/* Footer Actions */}
        <div className={styles.modalFooter}>
          <div className={styles.footerLeft}>
            <Button
              variant="secondary"
              size="sm"
              onClick={testPrint}
              disabled={!connectedDevice || isPrinting}
            >
              <Play size={14} style={{ marginRight: 6 }} />
              {isPrinting ? 'Printing…' : 'Print Test Label'}
            </Button>

            <Button
              variant="secondary"
              size="sm"
              onClick={feedLabel}
              disabled={!connectedDevice || isPrinting}
              title="Feed one label to calibrate gap sensor"
            >
              <ArrowDown size={14} style={{ marginRight: 6 }} />
              Feed 1 Label
            </Button>
          </div>

          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
