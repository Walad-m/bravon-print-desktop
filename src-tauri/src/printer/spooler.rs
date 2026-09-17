use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpoolerPrinterInfo {
    pub name: String,
    pub port_name: Option<String>,
    pub driver_name: Option<String>,
    pub is_default: bool,
    pub is_likely_printer: bool,
    pub job_count: u32,
    pub status: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrintJobDetail {
    pub id: u32,
    pub document_name: String,
    pub status: String,
    pub pages: u32,
}

#[cfg(windows)]
pub fn list_spooler_printers() -> Vec<SpoolerPrinterInfo> {
    use std::ptr::null_mut;
    use windows_sys::Win32::Graphics::Printing::*;

    let mut result = Vec::new();
    let flags = PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS;
    let mut bytes_needed: u32 = 0;
    let mut count_returned: u32 = 0;

    unsafe {
        // Call with 0 buffer to determine required buffer size for PRINTER_INFO_1W
        let _ = EnumPrintersW(
            flags,
            null_mut(),
            1,
            null_mut(),
            0,
            &mut bytes_needed,
            &mut count_returned,
        );

        if bytes_needed == 0 {
            return result;
        }

        let mut buffer: Vec<u8> = vec![0u8; bytes_needed as usize];
        let success = EnumPrintersW(
            flags,
            null_mut(),
            1,
            buffer.as_mut_ptr(),
            bytes_needed,
            &mut bytes_needed,
            &mut count_returned,
        );

        if success == 0 {
            return result;
        }

        let printers = buffer.as_ptr() as *const PRINTER_INFO_1W;
        for i in 0..count_returned as usize {
            let p = &*printers.add(i);
            let name = wide_ptr_to_string(p.pName);
            let desc = wide_ptr_to_string(p.pDescription);
            let comment = wide_ptr_to_string(p.pComment);

            // Windows PRINTER_INFO_1W pDescription is formatted as: "PrinterName,DriverName,PortName"
            let parts: Vec<&str> = desc.split(',').map(|s| s.trim()).collect();
            let driver_candidate = parts.get(1).copied().filter(|s| !s.is_empty());
            let port_candidate = parts.get(2).copied().filter(|s| !s.is_empty());

            let is_likely = is_likely_label_printer(&name, &desc, &comment);
            
            // Query live queue count for this printer
            let jobs = get_printer_queue_jobs(&name);
            let job_count = jobs.len() as u32;

            result.push(SpoolerPrinterInfo {
                name,
                port_name: port_candidate.map(|s| s.to_string()),
                driver_name: driver_candidate.map(|s| s.to_string()),
                is_default: (p.Flags & PRINTER_ENUM_DEFAULT) != 0,
                is_likely_printer: is_likely,
                job_count,
                status: if job_count > 0 { 1 } else { 0 },
            });
        }
    }

    result
}

#[cfg(windows)]
pub fn get_printer_queue_jobs(printer_name: &str) -> Vec<PrintJobDetail> {
    use std::ptr::null_mut;
    use windows_sys::Win32::Foundation::HANDLE;
    use windows_sys::Win32::Graphics::Printing::*;

    let mut jobs_list = Vec::new();
    let printer_wide: Vec<u16> = printer_name.encode_utf16().chain(Some(0)).collect();

    unsafe {
        let mut handle: HANDLE = 0 as HANDLE;
        if OpenPrinterW(printer_wide.as_ptr() as *mut u16, &mut handle, null_mut()) == 0 {
            return jobs_list;
        }

        let mut bytes_needed: u32 = 0;
        let mut count_returned: u32 = 0;

        let _ = EnumJobsW(
            handle,
            0,
            20,
            1, // JOB_INFO_1W
            null_mut(),
            0,
            &mut bytes_needed,
            &mut count_returned,
        );

        if bytes_needed > 0 {
            let mut buffer: Vec<u8> = vec![0u8; bytes_needed as usize];
            let success = EnumJobsW(
                handle,
                0,
                20,
                1,
                buffer.as_mut_ptr(),
                bytes_needed,
                &mut bytes_needed,
                &mut count_returned,
            );

            if success != 0 {
                let jobs = buffer.as_ptr() as *const JOB_INFO_1W;
                for i in 0..count_returned as usize {
                    let j = &*jobs.add(i);
                    let doc_name = wide_ptr_to_string(j.pDocument);
                    let status_str = match j.Status {
                        0 => "Queued / Pending".to_string(),
                        s if (s & JOB_STATUS_PRINTING) != 0 => "Printing".to_string(),
                        s if (s & JOB_STATUS_ERROR) != 0 => "Error / Blocked".to_string(),
                        s if (s & JOB_STATUS_PAUSED) != 0 => "Paused".to_string(),
                        s if (s & JOB_STATUS_PAPEROUT) != 0 => "Paper Out".to_string(),
                        s if (s & JOB_STATUS_RETAINED) != 0 => "Retained / Stuck".to_string(),
                        s => format!("Status code: {}", s),
                    };

                    jobs_list.push(PrintJobDetail {
                        id: j.JobId,
                        document_name: if doc_name.is_empty() { "Label Document".into() } else { doc_name },
                        status: status_str,
                        pages: j.TotalPages,
                    });
                }
            }
        }

        ClosePrinter(handle);
    }

    jobs_list
}

#[cfg(windows)]
pub fn write_spooler_raw(printer_name: &str, doc_name: &str, data: &[u8]) -> Result<(), String> {
    use std::ptr::null_mut;
    use windows_sys::Win32::Foundation::HANDLE;
    use windows_sys::Win32::Graphics::Printing::*;

    let printer_wide: Vec<u16> = printer_name.encode_utf16().chain(Some(0)).collect();
    let doc_wide: Vec<u16> = doc_name.encode_utf16().chain(Some(0)).collect();
    let raw_datatype: Vec<u16> = "RAW".encode_utf16().chain(Some(0)).collect();

    unsafe {
        let mut handle: HANDLE = 0 as HANDLE;
        if OpenPrinterW(printer_wide.as_ptr() as *mut u16, &mut handle, null_mut()) == 0 {
            return Err(format!(
                "Failed to open Windows printer '{}'. Check if it is plugged in and turned on.",
                printer_name
            ));
        }

        let doc_info = DOC_INFO_1W {
            pDocName: doc_wide.as_ptr() as *mut u16,
            pOutputFile: null_mut(),
            pDatatype: raw_datatype.as_ptr() as *mut u16,
        };

        let job_id = StartDocPrinterW(handle, 1, &doc_info as *const _);
        if job_id == 0 {
            ClosePrinter(handle);
            return Err(format!("Failed to start print job for '{}'.", printer_name));
        }

        if StartPagePrinter(handle) == 0 {
            EndDocPrinter(handle);
            ClosePrinter(handle);
            return Err(format!("Failed to start print page for '{}'.", printer_name));
        }

        let mut written: u32 = 0;
        let success = WritePrinter(
            handle,
            data.as_ptr() as *const _,
            data.len() as u32,
            &mut written,
        );

        EndPagePrinter(handle);
        EndDocPrinter(handle);
        ClosePrinter(handle);

        if success == 0 || written != data.len() as u32 {
            return Err(format!(
                "Failed to write all raw bytes to printer '{}' (wrote {}/{} bytes).",
                printer_name,
                written,
                data.len()
            ));
        }
    }

    Ok(())
}

#[cfg(windows)]
pub fn clear_spooler_jobs(printer_name: &str) -> Result<(), String> {
    let output = std::process::Command::new("powershell")
        .args([
            "-NoProfile",
            "-Command",
            &format!("Get-PrintJob -PrinterName '{}' -ErrorAction SilentlyContinue | Remove-PrintJob", printer_name),
        ])
        .output()
        .map_err(|e| format!("Failed to execute queue clear: {}", e))?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Queue clear returned error: {}", err));
    }
    Ok(())
}

#[cfg(not(windows))]
pub fn list_spooler_printers() -> Vec<SpoolerPrinterInfo> {
    use std::process::Command;
    let mut result = Vec::new();

    // Query default printer via `lpstat -d`
    let mut default_printer_name = String::new();
    if let Ok(out) = Command::new("lpstat").arg("-d").output() {
        let text = String::from_utf8_lossy(&out.stdout);
        // Output format: "system default destination: Printer_Name"
        if let Some(idx) = text.find(':') {
            default_printer_name = text[idx + 1..].trim().to_string();
        }
    }

    // Query available printers via `lpstat -p`
    if let Ok(out) = Command::new("lpstat").arg("-p").output() {
        let text = String::from_utf8_lossy(&out.stdout);
        // Output lines like: "printer ZJ_9260 is idle. enabled since..."
        for line in text.lines() {
            let line_trim = line.trim();
            if line_trim.starts_with("printer ") {
                let parts: Vec<&str> = line_trim.split_whitespace().collect();
                if let Some(printer_name) = parts.get(1) {
                    let name = printer_name.to_string();
                    let is_def = name == default_printer_name;
                    let is_likely = is_likely_label_printer(&name, "", "CUPS");
                    let jobs = get_printer_queue_jobs(&name);
                    let job_count = jobs.len() as u32;

                    result.push(SpoolerPrinterInfo {
                        name: name.clone(),
                        port_name: Some("CUPS USB / Network".into()),
                        driver_name: Some("CUPS Raw Printer".into()),
                        is_default: is_def,
                        is_likely_printer: is_likely,
                        job_count,
                        status: if job_count > 0 { 1 } else { 0 },
                    });
                }
            }
        }
    }

    result
}

#[cfg(not(windows))]
pub fn get_printer_queue_jobs(printer_name: &str) -> Vec<PrintJobDetail> {
    use std::process::Command;
    let mut jobs_list = Vec::new();

    // Query queue via `lpstat -o <printer_name>`
    if let Ok(out) = Command::new("lpstat").args(["-o", printer_name]).output() {
        let text = String::from_utf8_lossy(&out.stdout);
        // Lines like: "ZJ_9260-1 user 1024 Wed Sep 17 00:00:00 2026"
        for (i, line) in text.lines().enumerate() {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if let Some(job_id_str) = parts.get(0) {
                jobs_list.push(PrintJobDetail {
                    id: (i + 1) as u32,
                    document_name: format!("Job {}", job_id_str),
                    status: "Queued in CUPS".to_string(),
                    pages: 1,
                });
            }
        }
    }

    jobs_list
}

#[cfg(not(windows))]
pub fn write_spooler_raw(printer_name: &str, doc_name: &str, data: &[u8]) -> Result<(), String> {
    use std::io::Write;
    use std::process::{Command, Stdio};

    let mut child = Command::new("lp")
        .args(["-d", printer_name, "-o", "raw", "-t", doc_name])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn CUPS lp command: {}", e))?;

    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(data)
            .map_err(|e| format!("Failed to write data to CUPS lp: {}", e))?;
    }

    let output = child
        .wait_with_output()
        .map_err(|e| format!("CUPS lp execution error: {}", e))?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err(format!("CUPS lp failed: {}", err));
    }

    Ok(())
}

#[cfg(not(windows))]
pub fn clear_spooler_jobs(printer_name: &str) -> Result<(), String> {
    use std::process::Command;
    let output = Command::new("cancel")
        .args(["-a", printer_name])
        .output()
        .map_err(|e| format!("Failed to execute CUPS cancel: {}", e))?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err(format!("CUPS cancel returned error: {}", err));
    }
    Ok(())
}


#[cfg(windows)]
unsafe fn wide_ptr_to_string(ptr: *mut u16) -> String {
    if ptr.is_null() {
        return String::new();
    }
    let mut len = 0;
    while *ptr.add(len) != 0 {
        len += 1;
    }
    let slice = std::slice::from_raw_parts(ptr, len);
    String::from_utf16_lossy(slice)
}

fn is_likely_label_printer(name: &str, driver: &str, port: &str) -> bool {
    let combined = format!("{} {} {}", name, driver, port).to_lowercase();
    combined.contains("label")
        || combined.contains("pos")
        || combined.contains("zjiang")
        || combined.contains("thermal")
        || combined.contains("bravon")
        || combined.contains("d100")
        || combined.contains("barcode")
}
