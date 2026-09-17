use serde::{Deserialize, Serialize};
use std::io::Write;
use std::net::TcpStream;
use std::time::Duration;

use crate::printer::document::{document_to_tspl, LabelDocument, PrintOptions};
use crate::printer::serial::{list_serial_ports, probe_serial_port, write_serial_bytes};
use crate::printer::spooler::{
    clear_spooler_jobs, get_printer_queue_jobs, list_spooler_printers, write_spooler_raw,
    PrintJobDetail,
};
use crate::printer::tspl::TsplBuilder;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum PrintTarget {
    #[serde(rename = "serial")]
    Serial {
        #[serde(rename = "portName")]
        port_name: String,
        #[serde(rename = "baudRate")]
        baud_rate: Option<u32>,
    },
    #[serde(rename = "spooler")]
    Spooler {
        #[serde(rename = "printerName")]
        printer_name: String,
    },
    #[serde(rename = "tcp")]
    Tcp {
        ip: String,
        port: u16,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UnifiedPrinterDevice {
    pub id: String,
    pub name: String,
    pub detail: String,
    #[serde(rename = "deviceType")]
    pub device_type: String, // "serial", "spooler", "tcp"
    #[serde(rename = "isLikelyPrinter")]
    pub is_likely_printer: bool,
    #[serde(rename = "portName")]
    pub port_name: Option<String>,
    #[serde(rename = "printerName")]
    pub printer_name: Option<String>,
    #[serde(rename = "jobCount")]
    pub job_count: Option<u32>,
    #[serde(rename = "isRecommended")]
    pub is_recommended: bool,
    pub category: String, // "thermal", "system"
    pub status: String,   // "ready", "stuck", "offline", "unknown"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrinterDiagnostic {
    pub reachable: bool,
    #[serde(rename = "jobCount")]
    pub job_count: u32,
    #[serde(rename = "statusText")]
    pub status_text: String,
    pub error: Option<String>,
}

#[tauri::command]
pub fn list_printer_devices() -> Vec<UnifiedPrinterDevice> {
    let mut devices = Vec::new();

    // 1. Spooler printers (e.g. "LABEL 5", "LABEL 3", "POS-58" installed on Windows)
    let spoolers = list_spooler_printers();
    
    // Find the highest versioned label printer (e.g. "LABEL 5")
    let recommended_spooler_name = spoolers
        .iter()
        .filter(|s| s.is_likely_printer && s.name.to_lowercase().contains("label"))
        .map(|s| s.name.clone())
        .max();

    for sp in spoolers {
        let port_str = sp.port_name.as_deref().unwrap_or("USB001");
        
        let is_system_doc = sp.name.contains("PDF") 
            || sp.name.contains("OneNote") 
            || sp.name.contains("XPS") 
            || sp.name.contains("Fax");

        let category = if is_system_doc { "system".to_string() } else { "thermal".to_string() };
        let is_rec = Some(&sp.name) == recommended_spooler_name.as_ref();
        
        let status = if sp.job_count > 0 {
            "stuck".to_string()
        } else {
            "ready".to_string()
        };

        let display_name = if sp.name.to_lowercase().contains("label") {
            format!("ZJ-9260 / {} (USB Cable)", sp.name)
        } else {
            sp.name.clone()
        };

        let detail = if sp.job_count > 0 {
            format!("Port: {} • ⚠️ {} stuck job(s) in queue (Click Clear Queue)", port_str, sp.job_count)
        } else if is_system_doc {
            format!("Virtual System Document Printer ({})", port_str)
        } else {
            format!("USB Cable ({}) • ZJ-9260 Direct Driver", port_str)
        };

        devices.push(UnifiedPrinterDevice {
            id: format!("spooler-{}", sp.name),
            name: display_name,
            detail,
            device_type: "spooler".to_string(),
            is_likely_printer: sp.is_likely_printer && !is_system_doc,
            port_name: sp.port_name,
            printer_name: Some(sp.name),
            job_count: Some(sp.job_count),
            is_recommended: is_rec,
            category,
            status,
        });
    }

    // 2. Serial (COM) ports (Bluetooth SPP, USB VCP)
    let serials = list_serial_ports();
    for s in serials {
        // Skip unlinked incoming loopbacks (e.g. COM5, COM11)
        if s.port_type == "incoming" || s.name.eq_ignore_ascii_case("COM5") || s.name.eq_ignore_ascii_case("COM11") {
            continue;
        }

        let is_bt = s.port_type == "bluetooth";

        let name_display = if let Some(ref bt_name) = s.bluetooth_device_name {
            if s.is_likely_printer {
                format!("ZJ-9260 / {} ({})", bt_name, s.name)
            } else {
                format!("{} ({})", bt_name, s.name)
            }
        } else if is_bt {
            format!("{} (Bluetooth Wireless)", s.name)
        } else {
            format!("{} ({})", s.name, s.port_type)
        };

        let detail = if let Some(ref bt_name) = s.bluetooth_device_name {
            if s.is_likely_printer {
                format!("Wireless Bluetooth SPP • Paired as '{}'", bt_name)
            } else {
                format!("Bluetooth Device • '{}'", bt_name)
            }
        } else {
            s.description.clone().unwrap_or_else(|| "Serial COM Port".into())
        };

        let category = if s.is_likely_printer { "thermal".to_string() } else { "other".to_string() };

        devices.push(UnifiedPrinterDevice {
            id: format!("serial-{}", s.name),
            name: name_display,
            detail,
            device_type: "serial".to_string(),
            is_likely_printer: s.is_likely_printer,
            port_name: Some(s.name),
            printer_name: None,
            job_count: None,
            is_recommended: s.is_recommended,
            category,
            status: "ready".to_string(),
        });
    }

    // Sort: 
    // 1. Recommended first (ZJ-9260 USB and Bluetooth printer)
    // 2. Likely thermal printers next
    // 3. System virtual printers / other devices last
    devices.sort_by(|a, b| {
        b.is_recommended.cmp(&a.is_recommended)
            .then_with(|| b.is_likely_printer.cmp(&a.is_likely_printer))
            .then_with(|| (a.category == "thermal").cmp(&(b.category == "thermal")).reverse())
    });

    devices
}

#[tauri::command]
pub fn auto_detect_printer() -> Result<UnifiedPrinterDevice, String> {
    let devices = list_printer_devices();

    // 1. Priority 1: Check for USB Driver (e.g. "LABEL 5" / "LABEL")
    for d in &devices {
        if d.device_type == "spooler" && d.is_likely_printer && d.is_recommended {
            let printer_name = d.printer_name.as_deref().unwrap_or(&d.name);
            let _ = clear_spooler_jobs(printer_name);
            return Ok(d.clone());
        }
    }

    // 2. Priority 2: Check for Bluetooth Thermal Printer (e.g. "COM10" / "BlueTooth Printer")
    for d in &devices {
        if d.device_type == "serial" && d.is_likely_printer && d.is_recommended {
            return Ok(d.clone());
        }
    }

    // 3. Priority 3: Any available thermal printer
    for d in &devices {
        if d.is_likely_printer && d.category == "thermal" {
            if d.device_type == "spooler" {
                let printer_name = d.printer_name.as_deref().unwrap_or(&d.name);
                let _ = clear_spooler_jobs(printer_name);
            }
            return Ok(d.clone());
        }
    }

    // 4. Any device
    devices.into_iter().next().ok_or_else(|| "No printer found. Please connect USB cable or turn on Bluetooth.".into())
}

#[tauri::command]
pub fn open_bluetooth_settings() -> Result<(), String> {
    #[cfg(windows)]
    {
        use std::process::Command;
        let _ = Command::new("cmd")
            .args(["/C", "start", "ms-settings:bluetooth"])
            .spawn()
            .map_err(|e| format!("Failed to open Windows Bluetooth settings: {}", e))?;
    }
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        let _ = Command::new("open")
            .args(["x-apple.systempreferences:com.apple.BluetoothSettings"])
            .spawn()
            .map_err(|e| format!("Failed to open macOS Bluetooth settings: {}", e))?;
    }
    Ok(())
}



#[tauri::command]
pub fn probe_printer_connection(target: PrintTarget) -> Result<PrinterDiagnostic, String> {
    match target {
        PrintTarget::Serial { port_name, baud_rate } => {
            let baud = baud_rate.unwrap_or(9600);
            match probe_serial_port(&port_name, baud) {
                Ok(_) => Ok(PrinterDiagnostic {
                    reachable: true,
                    job_count: 0,
                    status_text: format!("Port {} is OPEN & ready (Baud: {})", port_name, baud),
                    error: None,
                }),
                Err(err) => Ok(PrinterDiagnostic {
                    reachable: false,
                    job_count: 0,
                    status_text: "Bluetooth / Serial device offline".into(),
                    error: Some(err),
                }),
            }
        }
        PrintTarget::Spooler { printer_name } => {
            let jobs = get_printer_queue_jobs(&printer_name);
            let count = jobs.len() as u32;
            if count > 0 {
                Ok(PrinterDiagnostic {
                    reachable: true,
                    job_count: count,
                    status_text: format!("Online with {} pending/stuck print job(s)", count),
                    error: Some(format!("Queue has {} job(s) waiting. Click 'Clear Queue' if printing is blocked.", count)),
                })
            } else {
                Ok(PrinterDiagnostic {
                    reachable: true,
                    job_count: 0,
                    status_text: "Spooler Ready (0 queued jobs)".into(),
                    error: None,
                })
            }
        }
        PrintTarget::Tcp { ip, port } => {
            let addr = format!("{}:{}", ip, port);
            match TcpStream::connect_timeout(
                &addr.parse().map_err(|e| format!("Invalid address: {}", e))?,
                Duration::from_secs(2),
            ) {
                Ok(_) => Ok(PrinterDiagnostic {
                    reachable: true,
                    job_count: 0,
                    status_text: format!("TCP Printer connected at {}", addr),
                    error: None,
                }),
                Err(e) => Ok(PrinterDiagnostic {
                    reachable: false,
                    job_count: 0,
                    status_text: "TCP Connection Failed".into(),
                    error: Some(e.to_string()),
                }),
            }
        }
    }
}

#[tauri::command]
pub fn get_printer_queue(printer_name: String) -> Result<Vec<PrintJobDetail>, String> {
    Ok(get_printer_queue_jobs(&printer_name))
}

#[tauri::command]
pub fn print_raw(target: PrintTarget, data: Vec<u8>) -> Result<(), String> {
    match target {
        PrintTarget::Serial {
            port_name,
            baud_rate,
        } => {
            let baud = baud_rate.unwrap_or(9600);
            write_serial_bytes(&port_name, baud, &data)
        }
        PrintTarget::Spooler { printer_name } => {
            write_spooler_raw(&printer_name, "Bravon Label Print", &data)
        }
        PrintTarget::Tcp { ip, port } => {
            let addr = format!("{}:{}", ip, port);
            let mut stream = TcpStream::connect_timeout(
                &addr.parse().map_err(|e| format!("Invalid address {}: {}", addr, e))?,
                Duration::from_secs(5),
            )
            .map_err(|e| format!("Failed to connect to printer at {}: {}", addr, e))?;

            stream
                .write_all(&data)
                .map_err(|e| format!("Failed to send data: {}", e))?;
            stream
                .flush()
                .map_err(|e| format!("Failed to flush stream: {}", e))?;

            Ok(())
        }
    }
}

#[tauri::command]
pub fn print_document(
    target: PrintTarget,
    document: LabelDocument,
    options: Option<PrintOptions>,
) -> Result<(), String> {
    let tspl_bytes = document_to_tspl(&document, &options);
    print_raw(target, tspl_bytes)
}

#[tauri::command]
pub fn test_print(target: PrintTarget) -> Result<(), String> {
    let target_desc = match &target {
        PrintTarget::Serial { port_name, .. } => port_name.clone(),
        PrintTarget::Spooler { printer_name } => printer_name.clone(),
        PrintTarget::Tcp { ip, port } => format!("{}:{}", ip, port),
    };

    let test_bytes = TsplBuilder::build_test_label(&target_desc);
    print_raw(target, test_bytes)
}

#[tauri::command]
pub fn feed_label(target: PrintTarget) -> Result<(), String> {
    // Send FORMFEED command to calibrate gap sensor / feed one label
    let feed_bytes = b"FORMFEED\r\n".to_vec();
    print_raw(target, feed_bytes)
}

#[tauri::command]
pub fn clear_printer_jobs(printer_name: String) -> Result<(), String> {
    clear_spooler_jobs(&printer_name)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_device_discovery() {
        let devices = list_printer_devices();
        println!("Found {} devices:", devices.len());
        for d in &devices {
            println!("  - [{}] {} ({}) - is_printer: {}", d.device_type, d.name, d.detail, d.is_likely_printer);
        }
        assert!(!devices.is_empty(), "Should discover at least COM ports or installed printers on this machine");
    }

    #[test]
    fn test_tspl_generation() {
        let label = TsplBuilder::build_test_label("COM6");
        let s = String::from_utf8_lossy(&label);
        assert!(s.contains("SIZE 58 mm,40 mm"));
        assert!(s.contains("CLS"));
        assert!(s.contains("PRINT 1,1"));
    }
}

