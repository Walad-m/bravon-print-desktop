use serde::{Deserialize, Serialize};
use super::tspl::TsplBuilder;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LabelSize {
    pub name: String,
    pub width: f64,  // mm
    pub height: f64, // mm
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum LabelElement {
    #[serde(rename = "text")]
    Text {
        id: String,
        x: f64, // mm
        y: f64, // mm
        rotation: Option<u32>,
        content: String,
        #[serde(rename = "fontSize")]
        font_size: Option<String>,
        bold: Option<bool>,
        width: Option<f64>,
        height: Option<f64>,
    },
    #[serde(rename = "barcode")]
    Barcode {
        id: String,
        x: f64,
        y: f64,
        rotation: Option<u32>,
        content: String,
        #[serde(rename = "barcodeType")]
        barcode_type: String,
        width: Option<f64>,
        height: f64,
        #[serde(rename = "showText")]
        show_text: Option<bool>,
    },
    #[serde(rename = "qrcode")]
    QRCode {
        id: String,
        x: f64,
        y: f64,
        rotation: Option<u32>,
        content: String,
        size: f64,
        #[serde(rename = "errorCorrection")]
        error_correction: Option<String>,
    },
    #[serde(rename = "line")]
    Line {
        id: String,
        x: f64,
        y: f64,
        rotation: Option<u32>,
        width: f64,
        thickness: Option<u32>,
    },
    #[serde(rename = "box")]
    Box {
        id: String,
        x: f64,
        y: f64,
        rotation: Option<u32>,
        width: f64,
        height: f64,
        thickness: Option<u32>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LabelDocument {
    pub size: LabelSize,
    pub elements: Vec<LabelElement>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrintOptions {
    pub copies: Option<u32>,
    pub density: Option<u32>, // 1-15
    pub speed: Option<u32>,   // 2-5
    #[serde(rename = "paperType")]
    pub paper_type: Option<String>, // "gap", "continuous", "black"
}

/// Convert millimeters to thermal printer dots at 203 DPI (8 dots per mm).
fn mm_to_dots(mm: f64) -> u32 {
    (mm * 8.0).round().max(0.0) as u32
}

/// Convert a high-level LabelDocument and print options into raw TSPL command bytes.
pub fn document_to_tspl(doc: &LabelDocument, options: &Option<PrintOptions>) -> Vec<u8> {
    let mut b = TsplBuilder::new();

    // 1. Label dimensions
    b.size_mm(doc.size.width, doc.size.height);

    let paper_type = options
        .as_ref()
        .and_then(|o| o.paper_type.as_deref())
        .unwrap_or("gap");

    match paper_type {
        "continuous" | "cont" => {
            b.continuous();
        }
        "black" | "bline" => {
            b.bline_mm(2.0, 0.0);
        }
        _ => {
            b.gap_mm(2.0, 0.0);
        }
    }

    // Direction and reference
    b.direction(0);
    b.reference(0, 0);

    // Speed and density
    if let Some(opts) = options {
        if let Some(spd) = opts.speed {
            b.speed(spd);
        }
        if let Some(den) = opts.density {
            b.density(den);
        }
    }

    // Clear buffer
    b.cls();

    // 2. Render each element
    for el in &doc.elements {
        match el {
            LabelElement::Text {
                x,
                y,
                rotation,
                content,
                font_size,
                ..
            } => {
                let x_dots = mm_to_dots(*x);
                let y_dots = mm_to_dots(*y);
                let rot = rotation.unwrap_or(0);

                let size_str = font_size.as_deref().unwrap_or("2");
                let size_int: u32 = size_str.parse().unwrap_or(2);

                let (font, mul) = match size_int {
                    1 => ("1", 1),
                    2 => ("2", 1),
                    3 => ("3", 1),
                    4 => ("3", 2),
                    5 => ("4", 2),
                    _ => ("3", 1),
                };

                let line_height_dots = match size_int {
                    1 => 16 * mul,
                    2 => 24 * mul,
                    3 => 30 * mul,
                    4 => 38 * mul,
                    5 => 52 * mul,
                    _ => 30 * mul,
                };

                for (idx, line) in content.lines().enumerate() {
                    let line_y = y_dots + (idx as u32 * line_height_dots);
                    b.text(x_dots, line_y, font, rot, mul, mul, line);
                }
            }
            LabelElement::Barcode {
                x,
                y,
                rotation,
                content,
                barcode_type,
                height,
                show_text,
                ..
            } => {
                let x_dots = mm_to_dots(*x);
                let y_dots = mm_to_dots(*y);
                let height_dots = mm_to_dots(*height).max(20);
                let rot = rotation.unwrap_or(0);
                let human: u8 = if show_text.unwrap_or(true) { 1 } else { 0 };

                let tspl_type = match barcode_type.to_uppercase().as_str() {
                    "CODE128" | "128" => "128",
                    "CODE39" | "39" => "39",
                    "EAN13" => "EAN13",
                    "EAN8" => "EAN8",
                    "UPC-A" | "UPCA" => "UPCA",
                    "ITF" | "ITF25" => "ITF25",
                    "CODABAR" => "CODABAR",
                    _ => "128",
                };

                // At 203 DPI, narrow=2 dots and wide=4 dots ensures Code 128/EAN fits standard label widths
                let narrow = 2u32;
                let wide = 4u32;

                b.barcode(
                    x_dots,
                    y_dots,
                    tspl_type,
                    height_dots,
                    human,
                    rot,
                    narrow,
                    wide,
                    content,
                );
            }
            LabelElement::QRCode {
                x,
                y,
                rotation,
                content,
                size,
                error_correction,
                ..
            } => {
                let x_dots = mm_to_dots(*x);
                let y_dots = mm_to_dots(*y);
                let rot = rotation.unwrap_or(0);
                let cell_w = (*size / 20.0).round().clamp(2.0, 10.0) as u32;
                let ecc = error_correction.as_deref().unwrap_or("M");

                b.qrcode(x_dots, y_dots, ecc, cell_w, rot, content);
            }
            LabelElement::Line {
                x,
                y,
                width,
                thickness,
                ..
            } => {
                let x_dots = mm_to_dots(*x);
                let y_dots = mm_to_dots(*y);
                let width_dots = mm_to_dots(*width);
                let thick = thickness.unwrap_or(2) * 2;

                b.bar(x_dots, y_dots, width_dots, thick.max(2));
            }
            LabelElement::Box {
                x,
                y,
                width,
                height,
                thickness,
                ..
            } => {
                let x_dots = mm_to_dots(*x);
                let y_dots = mm_to_dots(*y);
                let x_end = x_dots + mm_to_dots(*width);
                let y_end = y_dots + mm_to_dots(*height);
                let thick = thickness.unwrap_or(2) * 2;

                b.box_rect(x_dots, y_dots, x_end, y_end, thick.max(2));
            }
        }
    }

    // 3. Print command
    let copies = options.as_ref().and_then(|o| o.copies).unwrap_or(1);
    b.print(1, copies);

    b.build()
}
