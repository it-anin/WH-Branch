import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

export default function SketchyBarcode({ value = '', width = 280, height = 56 }) {
  const svgRef = useRef(null);

  useEffect(() => {
    if (!svgRef.current || !value) return;
    try {
      JsBarcode(svgRef.current, value, {
        format: 'CODE128',
        width: 2,
        height: height - 20,
        displayValue: true,
        fontSize: 11,
        fontOptions: '',
        font: 'JetBrains Mono, monospace',
        textMargin: 4,
        margin: 4,
        background: 'transparent',
        lineColor: '#1a1a1a',
      });
    } catch {
      // value ที่ส่งมาอาจมีอักขระที่ Code128 ไม่รองรับ
    }
  }, [value, height]);

  return <svg ref={svgRef} style={{ maxWidth: width }} />;
}
