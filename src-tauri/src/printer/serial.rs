use serde::{Deserialize, Serialize};
use std::time::Duration;

#[cfg(windows)]
use winreg::enums::*;
#[cfg(windows)]
use winreg::RegKey;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SerialPortDescriptor {
    pub name: String,
    pub description: Option<String>,
    #[serde(rename = "bluetoothDeviceName")]
    pub bluetooth_device_name: Option<String>,
    #[serde(rename = "bluetoothMac")]
    pub bluetooth_mac: Option<String>,
    pub port_type: String, // "bluetooth", "usb", "serial", "incoming"
    pub is_likely_printer: bool,
    pub is_recommended: bool,
}

#[derive(Debug, Clone)]
pub struct BluetoothPortInfo {
    pub port_name: String,
    pub device_name: String,
    pub mac_address: String,
    pub is_outgoing: bool,
    pub is_printer: bool,
}

#[cfg(windows)]
pub fn query_windows_bluetooth_mappings() -> Vec<BluetoothPortInfo> {
    use std::collections::HashMap;
    let mut results = Vec::new();
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);

    // 1. Read all paired bluetooth device names from BTHPORT\Parameters\Devices
    let mut mac_to_name: HashMap<String, String> = HashMap::new();
    if let Ok(devices_key) = hklm.open_subkey("SYSTEM\\CurrentControlSet\\Services\\BTHPORT\\Parameters\\Devices") {
        for mac_sub in devices_key.enum_keys().filter_map(|k| k.ok()) {
            let normalized_mac = mac_sub.to_uppercase();
            if let Ok(dev_key) = devices_key.open_subkey(&mac_sub) {
                if let Ok(raw_name) = dev_key.get_raw_value("Name") {
                    let clean_name = String::from_utf8_lossy(&raw_name.bytes)
                        .trim_matches('\0')
                        .trim()
                        .to_string();
                    if !clean_name.is_empty() {
                        mac_to_name.insert(normalized_mac, clean_name);
                    }
                }
            }
        }
    }

    // 2. Read BTHENUM SPP keys to match PortName (e.g. COM10) with Bluetooth MAC & Name
    if let Ok(enum_key) = hklm.open_subkey("SYSTEM\\CurrentControlSet\\Enum\\BTHENUM") {
        for spp_group in enum_key.enum_keys().filter_map(|k| k.ok()) {
            if !spp_group.starts_with("{00001101-0000-1000-8000-00805F9B34FB}") {
                continue;
            }
            if let Ok(group_key) = enum_key.open_subkey(&spp_group) {
                for dev_instance in group_key.enum_keys().filter_map(|k| k.ok()) {
                    let instance_upper = dev_instance.to_uppercase();
                    if let Ok(inst_key) = group_key.open_subkey(&dev_instance) {
                        if let Ok(params_key) = inst_key.open_subkey("Device Parameters") {
                            if let Ok(port_name) = params_key.get_value::<String, _>("PortName") {
                                let is_incoming = instance_upper.contains("000000000000");

                                let mut matched_name = "Bluetooth Device".to_string();
                                let mut matched_mac = "".to_string();

                                for (mac, name) in &mac_to_name {
                                    if instance_upper.contains(mac) {
                                        matched_name = name.clone();
                                        matched_mac = mac.clone();
                                        break;
                                    }
                                }

                                let is_printer = is_printer_keyword(&matched_name) && !is_incoming;

                                results.push(BluetoothPortInfo {
                                    port_name: port_name.clone(),
                                    device_name: if is_incoming {
                                        "Incoming Bluetooth Port (Unlinked)".into()
                                    } else {
                                        matched_name
                                    },
                                    mac_address: matched_mac,
                                    is_outgoing: !is_incoming,
                                    is_printer,
                                });
                            }
                        }
                    }
                }
            }
        }
    }

    results
}

#[cfg(not(windows))]
pub fn query_windows_bluetooth_mappings() -> Vec<BluetoothPortInfo> {
    Vec::new()
}

/// List all available serial (COM) ports on the system.
/// Uses Windows Bluetooth registry inspection to automatically identify paired thermal printers.
pub fn list_serial_ports() -> Vec<SerialPortDescriptor> {
    let mut result = Vec::new();

    let bt_mappings = query_windows_bluetooth_mappings();

    let ports = match serialport::available_ports() {
        Ok(p) => p,
        Err(err) => {
            eprintln!("Warning: failed to enumerate serial ports: {}", err);
            return result;
        }
    };

    for p in ports {
        let matched_bt = bt_mappings.iter().find(|m| m.port_name.eq_ignore_ascii_case(&p.port_name));

        let (p_type, desc, bt_dev_name, bt_mac, is_likely, is_rec) = if let Some(bt) = matched_bt {
            if !bt.is_outgoing {
                // Incoming loopback port (e.g. COM5, COM11)
                ("incoming".to_string(), Some("Incoming Bluetooth Port (Unlinked)".into()), None, None, false, false)
            } else if bt.is_printer {
                (
                    "bluetooth".to_string(),
                    Some(format!("{} (Wireless Bluetooth Link)", bt.device_name)),
                    Some(bt.device_name.clone()),
                    Some(bt.mac_address.clone()),
                    true,
                    true,
                )
            } else {
                (
                    "bluetooth".to_string(),
                    Some(format!("{} (Bluetooth)", bt.device_name)),
                    Some(bt.device_name.clone()),
                    Some(bt.mac_address.clone()),
                    false,
                    false,
                )
            }
        } else {
            match &p.port_type {
                serialport::SerialPortType::UsbPort(usb) => {
                    let product = usb.product.clone().unwrap_or_else(|| "USB Device".into());
                    let mfg = usb.manufacturer.clone().unwrap_or_default();
                    let full_desc = if !mfg.is_empty() {
                        format!("{} ({})", product, mfg)
                    } else {
                        product
                    };
                    let likely = is_printer_keyword(&full_desc);
                    ("usb".to_string(), Some(full_desc), None, None, likely, likely)
                }
                serialport::SerialPortType::BluetoothPort => {
                    let is_incoming = p.port_name.contains("Incoming");
                    let likely = is_printer_keyword(&p.port_name) && !is_incoming;
                    (
                        if is_incoming { "incoming".to_string() } else { "bluetooth".to_string() },
                        Some(if is_incoming { "Incoming Bluetooth Port (Unlinked)".into() } else { "Bluetooth SPP Link".into() }),
                        None,
                        None,
                        likely,
                        likely,
                    )
                }
                serialport::SerialPortType::PciPort => {
                    ("serial".to_string(), Some("PCI Serial Port".into()), None, None, false, false)
                }
                serialport::SerialPortType::Unknown => {
                    let is_incoming = p.port_name.contains("Incoming") || p.port_name.eq_ignore_ascii_case("COM5") || p.port_name.eq_ignore_ascii_case("COM11");
                    let is_mac_cu = p.port_name.starts_with("/dev/cu.");
                    let is_mac_bt = is_mac_cu && (p.port_name.to_lowercase().contains("printer") || p.port_name.to_lowercase().contains("zj") || p.port_name.to_lowercase().contains("bluetooth"));
                    let is_rec = p.port_name.eq_ignore_ascii_case("COM10") || is_mac_bt;
                    let likely = is_rec || (is_printer_keyword(&p.port_name) && !is_incoming);
                    
                    (
                        if is_incoming { "incoming".to_string() } else if is_mac_bt { "bluetooth".to_string() } else { "serial".to_string() },
                        Some(if is_mac_bt { "macOS Bluetooth SPP Port".into() } else if is_incoming { "Incoming Bluetooth Port (Unlinked)".into() } else { "Serial Port".into() }),
                        None,
                        None,
                        likely,
                        is_rec,
                    )
                }
            }
        };


        result.push(SerialPortDescriptor {
            name: p.port_name,
            description: desc,
            bluetooth_device_name: bt_dev_name,
            bluetooth_mac: bt_mac,
            port_type: p_type,
            is_likely_printer: is_likely,
            is_recommended: is_rec,
        });
    }

    result
}

pub fn is_printer_keyword(text: &str) -> bool {
    let lower = text.to_lowercase();
    lower.contains("print")
        || lower.contains("label")
        || lower.contains("pos")
        || lower.contains("zjiang")
        || lower.contains("bravon")
        || lower.contains("thermal")
        || lower.contains("barcode")
        || lower.contains("9260")
        || lower.contains("8250")
        || lower.contains("3397")
        || lower.contains("bluetooth")
}

/// Write raw byte stream to a serial port at the specified baud rate (e.g. 9600, 115200).
/// Uses chunked transmission with flow control to prevent Bluetooth RFCOMM buffer drops.
pub fn write_serial_bytes(port_name: &str, baud_rate: u32, data: &[u8]) -> Result<(), String> {
    use std::io::Write;

    let baud = if baud_rate == 0 { 9600 } else { baud_rate };

    let clean_port = if let Some(idx) = port_name.find(' ') {
        &port_name[..idx]
    } else {
        port_name
    };

    if clean_port.eq_ignore_ascii_case("COM5") || clean_port.eq_ignore_ascii_case("COM11") {
        return Err(
            format!("{} is an incoming Bluetooth listener port with no printer connected. Please use the auto-detected Bluetooth port (COM10) or USB driver.", clean_port)
        );
    }

    let mut port = serialport::new(clean_port, baud)
        .timeout(Duration::from_secs(8))
        .data_bits(serialport::DataBits::Eight)
        .stop_bits(serialport::StopBits::One)
        .parity(serialport::Parity::None)
        .flow_control(serialport::FlowControl::None)
        .open()
        .map_err(|e| {
            format!(
                "Failed to open port '{}' at {} baud: {}. Make sure the printer is turned ON and within Bluetooth range.",
                clean_port, baud, e
            )
        })?;

    // Assert DTR & RTS for hardware flow readiness
    let _ = port.write_data_terminal_ready(true);
    let _ = port.write_request_to_send(true);
    std::thread::sleep(Duration::from_millis(50));

    // Send data in chunks (128 bytes) with 20ms spacing to prevent Bluetooth RFCOMM buffer overflow
    let chunk_size = 128;
    for chunk in data.chunks(chunk_size) {
        port.write_all(chunk).map_err(|e| {
            format!(
                "Failed to send data to '{}': {}. Check printer power and Bluetooth connection.",
                clean_port, e
            )
        })?;
        std::thread::sleep(Duration::from_millis(20));
    }

    port.flush().map_err(|e| {
        format!("Failed to flush port '{}': {}", clean_port, e)
    })?;

    std::thread::sleep(Duration::from_millis(100));
    Ok(())
}

/// Probes a serial/Bluetooth port to verify if the device is reachable and openable.
pub fn probe_serial_port(port_name: &str, baud_rate: u32) -> Result<(), String> {
    let baud = if baud_rate == 0 { 9600 } else { baud_rate };
    let clean_port = if let Some(idx) = port_name.find(' ') {
        &port_name[..idx]
    } else {
        port_name
    };

    if clean_port.eq_ignore_ascii_case("COM5") || clean_port.eq_ignore_ascii_case("COM11") {
        return Err(format!("{} is an incoming listener port, not an outgoing printer port.", clean_port));
    }

    let mut port = serialport::new(clean_port, baud)
        .timeout(Duration::from_millis(2500))
        .open()
        .map_err(|e| {
            format!(
                "Cannot open port '{}': {}. Make sure the printer is turned on and paired.",
                clean_port, e
            )
        })?;

    let _ = port.write_data_terminal_ready(true);
    let _ = port.write_request_to_send(true);

    Ok(())
}

