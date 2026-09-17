pub mod commands;
pub mod printer;

use commands::{
    auto_detect_printer, clear_printer_jobs, feed_label, get_printer_queue, list_printer_devices,
    open_bluetooth_settings, print_document, print_raw, probe_printer_connection, test_print,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            list_printer_devices,
            auto_detect_printer,
            open_bluetooth_settings,
            print_raw,
            print_document,
            test_print,
            feed_label,
            clear_printer_jobs,
            probe_printer_connection,
            get_printer_queue,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

