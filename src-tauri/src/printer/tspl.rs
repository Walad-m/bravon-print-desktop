/// TSPL (Taiwan Semiconductor Printer Language) command builder.
/// Directly compatible with ZJiang, Rongta, TSC, D100, and standard thermal label printers.
pub struct TsplBuilder {
    commands: Vec<u8>,
}

impl TsplBuilder {
    pub fn new() -> Self {
        Self {
            commands: Vec::new(),
        }
    }

    fn push_str(&mut self, s: &str) {
        self.commands.extend_from_slice(s.as_bytes());
    }

    /// Set label dimensions in millimeters (width mm, height mm).
    pub fn size_mm(&mut self, width: f64, height: f64) -> &mut Self {
        self.push_str(&format!("SIZE {} mm,{} mm\r\n", width, height));
        self
    }

    /// Set gap distance between labels (e.g. 2 mm, 0 mm).
    pub fn gap_mm(&mut self, length: f64, offset: f64) -> &mut Self {
        self.push_str(&format!("GAP {} mm,{} mm\r\n", length, offset));
        self
    }

    /// Black mark label sensor setup.
    pub fn bline_mm(&mut self, length: f64, offset: f64) -> &mut Self {
        self.push_str(&format!("BLINE {} mm,{} mm\r\n", length, offset));
        self
    }

    /// Continuous paper mode (no gap).
    pub fn continuous(&mut self) -> &mut Self {
        self.push_str("GAP 0 mm,0 mm\r\n");
        self
    }

    /// Set print speed in inches per second (typically 2 to 5).
    pub fn speed(&mut self, speed: u32) -> &mut Self {
        let s = speed.clamp(1, 6);
        self.push_str(&format!("SPEED {}\r\n", s));
        self
    }

    /// Set print darkness / thermal density (1 to 15).
    pub fn density(&mut self, density: u32) -> &mut Self {
        let d = density.clamp(1, 15);
        self.push_str(&format!("DENSITY {}\r\n", d));
        self
    }

    /// Set print direction (0 = normal, 1 = reversed).
    pub fn direction(&mut self, direction: u8) -> &mut Self {
        self.push_str(&format!("DIRECTION {},0\r\n", direction));
        self
    }

    /// Set reference coordinate origin (default 0,0).
    pub fn reference(&mut self, x: u32, y: u32) -> &mut Self {
        self.push_str(&format!("REFERENCE {},{}\r\n", x, y));
        self
    }

    /// Clear image buffer before drawing.
    pub fn cls(&mut self) -> &mut Self {
        self.push_str("CLS\r\n");
        self
    }

    /// Draw text.
    /// font: "1" (8x12), "2" (12x20), "3" (16x24), "4" (24x32), "5" (32x48), "TSS24.BF2" (Chinese/Unicode).
    /// rotation: 0, 90, 180, 270.
    /// x_mul, y_mul: 1 to 10.
    pub fn text(
        &mut self,
        x: u32,
        y: u32,
        font: &str,
        rotation: u32,
        x_mul: u32,
        y_mul: u32,
        content: &str,
    ) -> &mut Self {
        let f = if font.is_empty() { "3" } else { font };
        let xm = x_mul.clamp(1, 10);
        let ym = y_mul.clamp(1, 10);
        self.push_str(&format!(
            "TEXT {},{},\"{}\",{},{},{},\"{}\"\r\n",
            x, y, f, rotation, xm, ym, content
        ));
        self
    }

    /// Draw 1D Barcode.
    /// barcode_type: "128", "39", "EAN13", "UPCA", "ITF25", "CODABAR".
    /// human_readable: 0 = none, 1 = left, 2 = center, 3 = right.
    pub fn barcode(
        &mut self,
        x: u32,
        y: u32,
        barcode_type: &str,
        height: u32,
        human_readable: u8,
        rotation: u32,
        narrow: u32,
        wide: u32,
        content: &str,
    ) -> &mut Self {
        self.push_str(&format!(
            "BARCODE {},{},\"{}\",{},{},{},{},{},\"{}\"\r\n",
            x, y, barcode_type, height, human_readable, rotation, narrow, wide, content
        ));
        self
    }

    /// Draw 2D QR Code.
    /// ecc: "L", "M", "Q", "H".
    /// cell_width: 1 to 10.
    pub fn qrcode(
        &mut self,
        x: u32,
        y: u32,
        ecc: &str,
        cell_width: u32,
        rotation: u32,
        content: &str,
    ) -> &mut Self {
        let cw = cell_width.clamp(1, 10);
        let e = match ecc {
            "L" | "M" | "Q" | "H" => ecc,
            _ => "M",
        };
        self.push_str(&format!(
            "QRCODE {},{},{},{},A,{},\"{}\"\r\n",
            x, y, e, cw, rotation, content
        ));
        self
    }

    /// Draw horizontal or vertical solid bar / line.
    pub fn bar(&mut self, x: u32, y: u32, width: u32, height: u32) -> &mut Self {
        self.push_str(&format!("BAR {},{},{},{}\r\n", x, y, width, height));
        self
    }

    /// Draw a rectangle box.
    pub fn box_rect(
        &mut self,
        x_start: u32,
        y_start: u32,
        x_end: u32,
        y_end: u32,
        thickness: u32,
    ) -> &mut Self {
        self.push_str(&format!(
            "BOX {},{},{},{},{}\r\n",
            x_start, y_start, x_end, y_end, thickness
        ));
        self
    }

    /// Print sets and copies.
    pub fn print(&mut self, sets: u32, copies: u32) -> &mut Self {
        let s = if sets == 0 { 1 } else { sets };
        let c = if copies == 0 { 1 } else { copies };
        self.push_str(&format!("PRINT {},{}\r\n", s, c));
        self
    }

    /// Build and return the raw byte sequence.
    pub fn build(self) -> Vec<u8> {
        self.commands
    }

    /// Generate a formatted Diagnostic / Test Print label (58x40mm or 80x50mm).
    pub fn build_test_label(target_name: &str) -> Vec<u8> {
        let mut b = Self::new();
        // 58mm x 40mm standard small label
        b.size_mm(58.0, 40.0)
            .gap_mm(2.0, 0.0)
            .direction(0)
            .reference(0, 0)
            .density(10)
            .speed(3)
            .cls();

        // Border box (around 58mm = 464 dots, 40mm = 320 dots)
        b.box_rect(16, 16, 448, 304, 3);

        // Header Title
        b.text(32, 28, "3", 0, 1, 1, "BRAVON PRINT DESKTOP");
        b.bar(32, 58, 400, 2);

        // Connection target info
        let display_target = if target_name.len() > 24 {
            &target_name[..24]
        } else {
            target_name
        };
        b.text(32, 68, "2", 0, 1, 1, &format!("Target: {}", display_target));
        b.text(32, 92, "2", 0, 1, 1, "Status: CONNECTED / READY");

        // Barcode
        b.barcode(32, 124, "128", 50, 1, 0, 2, 4, "BRAVON-OK");

        // QR Code
        b.qrcode(330, 120, "M", 4, 0, "https://bravon.app");

        // Timestamp note
        b.bar(32, 240, 400, 2);
        b.text(32, 252, "1", 0, 1, 1, "Hardware verified via TSPL driver");

        b.print(1, 1);
        b.build()
    }
}
