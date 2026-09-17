export class EscPosCommandBuilder {
  private buffer: number[] = [];
  private encoder: TextEncoder = new TextEncoder();

  // Standard ESC/POS Commands
  private static readonly ESC = 0x1b;
  private static readonly GS = 0x1d;
  private static readonly LF = 0x0a;

  /**
   * Initializes the printer (ESC @)
   */
  init(): this {
    this.buffer.push(EscPosCommandBuilder.ESC, 0x40);
    return this;
  }

  /**
   * Sets text alignment
   * @param align 0: Left, 1: Center, 2: Right
   */
  align(align: 0 | 1 | 2): this {
    this.buffer.push(EscPosCommandBuilder.ESC, 0x61, align);
    return this;
  }

  /**
   * Sets font emphasis (Bold)
   * @param bold true to enable, false to disable
   */
  bold(bold: boolean): this {
    this.buffer.push(EscPosCommandBuilder.ESC, 0x45, bold ? 1 : 0);
    return this;
  }

  /**
   * Prints text
   * @param text string to print
   */
  text(text: string): this {
    const encoded = this.encoder.encode(text);
    for (const byte of encoded) {
      this.buffer.push(byte);
    }
    return this;
  }

  /**
   * Prints text and adds a line feed
   */
  textLine(text: string): this {
    this.text(text);
    this.buffer.push(EscPosCommandBuilder.LF);
    return this;
  }

  /**
   * Adds new lines
   * @param count number of lines
   */
  feed(count: number = 1): this {
    for (let i = 0; i < count; i++) {
      this.buffer.push(EscPosCommandBuilder.LF);
    }
    return this;
  }

  /**
   * Performs a partial or full paper cut
   * @param partial true for partial cut, false for full
   */
  cut(partial: boolean = true): this {
    this.buffer.push(EscPosCommandBuilder.GS, 0x56, partial ? 1 : 0);
    return this;
  }

  /**
   * Builds and returns the final Uint8Array buffer
   */
  build(): Uint8Array {
    return new Uint8Array(this.buffer);
  }
}
