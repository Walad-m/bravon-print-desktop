import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';
import {
  UnifiedPrinterDevice,
  PrintTarget,
  PrintOptions,
  LabelDocument,
  PrinterDiagnostic,
  PrintJobDetail,
} from '../types/label';

interface PrinterState {
  discoveredDevices: UnifiedPrinterDevice[];
  connectedDevice: UnifiedPrinterDevice | null;
  baudRate: number;
  isScanning: boolean;
  isConnecting: boolean;
  isPrinting: boolean;
  isProbing: boolean;
  diagnostic: PrinterDiagnostic | null;
  activeQueueJobs: PrintJobDetail[];
  lastError: string | null;
  lastSuccessMessage: string | null;

  // Actions
  scanDevices: () => Promise<void>;
  autoDetectPrinter: () => Promise<UnifiedPrinterDevice | null>;
  openBluetoothSettings: () => Promise<void>;
  connectToDevice: (device: UnifiedPrinterDevice) => void;
  probeDevice: (device?: UnifiedPrinterDevice) => Promise<PrinterDiagnostic | null>;
  fetchQueue: (printerName?: string) => Promise<PrintJobDetail[]>;
  setBaudRate: (rate: number) => void;
  disconnect: () => void;
  testPrint: () => Promise<void>;
  feedLabel: () => Promise<void>;
  clearPrinterQueue: (printerName?: string) => Promise<void>;
  printDocument: (document: LabelDocument, options?: PrintOptions) => Promise<void>;
  printRawBase64: (base64Data: string) => Promise<void>;
  clearError: () => void;
  clearSuccessMessage: () => void;
}

const STORAGE_KEY_DEVICE = 'bravon_printer_last_device';
const STORAGE_KEY_BAUD = 'bravon_printer_baud_rate';

export const usePrinterStore = create<PrinterState>((set, get) => {
  // Try restoring saved printer from localStorage
  let savedDevice: UnifiedPrinterDevice | null = null;
  let savedBaud = 9600;
  if (typeof window !== 'undefined') {
    try {
      const rawDev = localStorage.getItem(STORAGE_KEY_DEVICE);
      if (rawDev) savedDevice = JSON.parse(rawDev);
      const rawBaud = localStorage.getItem(STORAGE_KEY_BAUD);
      if (rawBaud) savedBaud = parseInt(rawBaud) || 9600;
    } catch {
      // ignore
    }
  }

  return {
    discoveredDevices: [],
    connectedDevice: savedDevice,
    baudRate: savedBaud,
    isScanning: false,
    isConnecting: false,
    isPrinting: false,
    isProbing: false,
    diagnostic: null,
    activeQueueJobs: [],
    lastError: null,
    lastSuccessMessage: null,

    scanDevices: async () => {
      set({ isScanning: true, lastError: null });

      const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
      if (!isTauri) {
        setTimeout(() => {
          set({
            isScanning: false,
            discoveredDevices: [
              {
                id: 'spooler-LABEL 5',
                name: 'ZJ-9260 / LABEL 5 (USB Cable)',
                detail: 'USB Cable (USB001) • ZJ-9260 Direct Driver',
                deviceType: 'spooler',
                isLikelyPrinter: true,
                printerName: 'LABEL 5',
                isRecommended: true,
                category: 'thermal',
                status: 'ready',
                jobCount: 0,
              },
              {
                id: 'serial-COM10',
                name: 'ZJ-9260 / BlueTooth Printer (COM10)',
                detail: "Wireless Bluetooth SPP • Paired as 'BlueTooth Printer'",
                deviceType: 'serial',
                isLikelyPrinter: true,
                portName: 'COM10',
                isRecommended: true,
                category: 'thermal',
                status: 'ready',
              },
            ],
          });
        }, 300);
        return;
      }

      try {
        const devices = await invoke<UnifiedPrinterDevice[]>('list_printer_devices');
        set({
          discoveredDevices: devices,
          lastError: devices.length === 0 ? 'No printer or COM ports found. Make sure Bluetooth or USB is active.' : null,
        });

        // Auto-select if nothing connected or if currently connected to invalid dummy COM5/COM11
        const current = get().connectedDevice;
        const isCurrentInvalid = !current || current.name.includes('COM5') || current.name.includes('COM11') || current.id.includes('COM5');
        if (isCurrentInvalid && devices.length > 0) {
          const preferred = devices.find((d) => d.isRecommended) 
            || devices.find((d) => d.isLikelyPrinter && !d.name.includes('COM5') && !d.name.includes('COM11')) 
            || devices[0];
          get().connectToDevice(preferred);
        } else if (current) {
          // Update connected device with fresh job counts / status
          const updated = devices.find((d) => d.id === current.id);
          if (updated) {
            set({ connectedDevice: updated });
          }
        }
      } catch (err) {
        set({ lastError: `Failed to scan devices: ${String(err)}` });
      } finally {
        set({ isScanning: false });
      }
    },

    autoDetectPrinter: async () => {
      set({ isConnecting: true, lastError: null });
      const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

      if (!isTauri) {
        const mockDev: UnifiedPrinterDevice = {
          id: 'spooler-LABEL 5',
          name: 'ZJ-9260 / LABEL 5 (USB Cable)',
          detail: 'USB Cable (USB001) • ZJ-9260 Direct Driver',
          deviceType: 'spooler',
          isLikelyPrinter: true,
          printerName: 'LABEL 5',
          isRecommended: true,
          category: 'thermal',
          status: 'ready',
          jobCount: 0,
        };
        get().connectToDevice(mockDev);
        set({ isConnecting: false, lastSuccessMessage: `Auto-connected to ${mockDev.name}!` });
        return mockDev;
      }

      try {
        const bestDevice = await invoke<UnifiedPrinterDevice>('auto_detect_printer');
        get().connectToDevice(bestDevice);
        set({
          lastSuccessMessage: `⚡ Auto-connected to ${bestDevice.name}! Ready to print.`,
        });
        return bestDevice;
      } catch (err) {
        set({ lastError: `Auto-detect failed: ${String(err)}` });
        return null;
      } finally {
        set({ isConnecting: false });
      }
    },

    openBluetoothSettings: async () => {
      const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
      if (!isTauri) {
        alert('Opening Windows Bluetooth Settings (Web Preview)');
        return;
      }
      try {
        await invoke('open_bluetooth_settings');
      } catch (err) {
        set({ lastError: `Failed to open Bluetooth settings: ${String(err)}` });
      }
    },


    connectToDevice: (device: UnifiedPrinterDevice) => {
      set({ connectedDevice: device, lastError: null, diagnostic: null });
      try {
        localStorage.setItem(STORAGE_KEY_DEVICE, JSON.stringify(device));
      } catch {
        // ignore
      }
      // Automatically probe device health upon connection
      get().probeDevice(device);
      if (device.deviceType === 'spooler') {
        get().fetchQueue(device.printerName || device.name);
      }
    },

    probeDevice: async (device?: UnifiedPrinterDevice) => {
      const targetDev = device || get().connectedDevice;
      if (!targetDev) return null;

      set({ isProbing: true });
      try {
        const target: PrintTarget = targetDev.deviceType === 'spooler'
          ? { type: 'spooler', printerName: targetDev.printerName || targetDev.name }
          : { type: 'serial', portName: targetDev.portName || targetDev.name.split(' ')[0], baudRate: get().baudRate };

        const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
        if (!isTauri) {
          const mockDiag: PrinterDiagnostic = {
            reachable: true,
            jobCount: 0,
            statusText: 'Mock Printer Connected (Web Preview)',
          };
          set({ diagnostic: mockDiag });
          return mockDiag;
        }

        const diag = await invoke<PrinterDiagnostic>('probe_printer_connection', { target });
        set({ diagnostic: diag });
        return diag;
      } catch (err) {
        const failedDiag: PrinterDiagnostic = {
          reachable: false,
          jobCount: 0,
          statusText: 'Health check failed',
          error: String(err),
        };
        set({ diagnostic: failedDiag });
        return failedDiag;
      } finally {
        set({ isProbing: false });
      }
    },

    fetchQueue: async (printerName?: string) => {
      const { connectedDevice } = get();
      const targetName = printerName || connectedDevice?.printerName || connectedDevice?.name;
      if (!targetName) return [];

      const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
      if (!isTauri) {
        return [];
      }

      try {
        const jobs = await invoke<PrintJobDetail[]>('get_printer_queue', { printerName: targetName });
        set({ activeQueueJobs: jobs });
        return jobs;
      } catch {
        return [];
      }
    },

    setBaudRate: (rate: number) => {
      set({ baudRate: rate });
      try {
        localStorage.setItem(STORAGE_KEY_BAUD, String(rate));
      } catch {
        // ignore
      }
    },

    disconnect: () => {
      set({ connectedDevice: null });
      try {
        localStorage.removeItem(STORAGE_KEY_DEVICE);
      } catch {
        // ignore
      }
    },

    testPrint: async () => {
      const { connectedDevice, baudRate } = get();
      if (!connectedDevice) {
        set({ lastError: 'No printer selected. Please select a port or printer first.' });
        return;
      }

      set({ isPrinting: true, lastError: null, lastSuccessMessage: null });
      try {
        const target: PrintTarget = connectedDevice.deviceType === 'spooler'
          ? { type: 'spooler', printerName: connectedDevice.printerName || connectedDevice.name }
          : { type: 'serial', portName: connectedDevice.portName || connectedDevice.name, baudRate };

        await invoke('test_print', { target });
        set({ lastSuccessMessage: `Test label sent successfully to ${connectedDevice.name}!` });
      } catch (err) {
        set({ lastError: `Test print failed: ${String(err)}` });
      } finally {
        set({ isPrinting: false });
      }
    },

    feedLabel: async () => {
      const { connectedDevice, baudRate } = get();
      if (!connectedDevice) {
        set({ lastError: 'No printer selected.' });
        return;
      }

      set({ isPrinting: true, lastError: null, lastSuccessMessage: null });
      try {
        const target: PrintTarget = connectedDevice.deviceType === 'spooler'
          ? { type: 'spooler', printerName: connectedDevice.printerName || connectedDevice.name }
          : { type: 'serial', portName: connectedDevice.portName || connectedDevice.name.split(' ')[0], baudRate };

        await invoke('feed_label', { target });
        set({ lastSuccessMessage: `Fed 1 label / calibrated gap sensor on ${connectedDevice.name}` });
      } catch (err) {
        set({ lastError: `Feed failed: ${String(err)}` });
      } finally {
        set({ isPrinting: false });
      }
    },

    clearPrinterQueue: async (printerName?: string) => {
      const { connectedDevice } = get();
      const targetName = printerName || connectedDevice?.printerName || connectedDevice?.name;
      if (!targetName) return;

      try {
        await invoke('clear_printer_jobs', { printerName: targetName });
        set({ lastSuccessMessage: `Cleared all stuck print jobs for ${targetName}` });
        // Refresh device list to reflect cleared job count
        await get().scanDevices();
      } catch (err) {
        set({ lastError: `Failed to clear print queue: ${String(err)}` });
      }
    },

    printDocument: async (document: LabelDocument, options?: PrintOptions) => {
      const { connectedDevice, baudRate } = get();
      if (!connectedDevice) {
        set({ lastError: 'No printer connected. Select a printer from the dashboard.' });
        return;
      }

      set({ isPrinting: true, lastError: null, lastSuccessMessage: null });
      try {
        const target: PrintTarget = connectedDevice.deviceType === 'spooler'
          ? { type: 'spooler', printerName: connectedDevice.printerName || connectedDevice.name }
          : { type: 'serial', portName: connectedDevice.portName || connectedDevice.name, baudRate };

        await invoke('print_document', {
          target,
          document,
          options: options || null,
        });
        set({ lastSuccessMessage: `Printed successfully to ${connectedDevice.name}!` });
      } catch (err) {
        set({ lastError: `Print error: ${String(err)}` });
        throw err;
      } finally {
        set({ isPrinting: false });
      }
    },

    printRawBase64: async (base64Data: string) => {
      const { connectedDevice, baudRate } = get();
      if (!connectedDevice) {
        set({ lastError: 'No printer connected.' });
        return;
      }

      set({ isPrinting: true, lastError: null });
      try {
        const binaryStr = atob(base64Data);
        const data: number[] = [];
        for (let i = 0; i < binaryStr.length; i++) {
          data.push(binaryStr.charCodeAt(i));
        }

        const target: PrintTarget = connectedDevice.deviceType === 'spooler'
          ? { type: 'spooler', printerName: connectedDevice.printerName || connectedDevice.name }
          : { type: 'serial', portName: connectedDevice.portName || connectedDevice.name, baudRate };

        await invoke('print_raw', { target, data });
        set({ lastSuccessMessage: `Print job delivered to ${connectedDevice.name}!` });
      } catch (err) {
        set({ lastError: `Print failed: ${String(err)}` });
      } finally {
        set({ isPrinting: false });
      }
    },

    clearError: () => set({ lastError: null }),
    clearSuccessMessage: () => set({ lastSuccessMessage: null }),
  };
});
