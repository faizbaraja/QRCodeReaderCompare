---
marp: true
theme: default
paginate: true
backgroundColor: #fff
style: |
  section {
    font-size: 28px;
  }
  h1 {
    color: #2563eb;
  }
  h2 {
    color: #1e40af;
  }
  table {
    font-size: 22px;
  }
  .columns {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }
---

# QR/Barcode Scanner Library Comparison

**Reference Benchmark:** Scanbot SDK (Commercial - Best-in-class)

Comparing: `html5-qrcode` vs `zbar-wasm` vs `qr-scanner`

![bg right:30% 80%](https://api.iconify.design/mdi:qrcode-scan.svg?color=%232563eb)

---

# Executive Summary

| Library | Technology | Performance | Status |
|---------|------------|:-----------:|:------:|
| **Scanbot** | WebAssembly (C/C++) | ⭐⭐⭐⭐⭐ | Commercial |
| **qr-scanner** | WASM + Native API | ⭐⭐⭐⭐ | ✅ Active |
| **zbar-wasm** | WebAssembly (C) | ⭐⭐⭐⭐ | ✅ Active |
| **html5-qrcode** | JavaScript | ⭐⭐⭐ | ❌ Unmaintained |

---

# Why Scanbot is the Benchmark?

- **Scan Speed:** 0.04 seconds (~40ms)
- **Technology:** Native C/C++ compiled to WebAssembly
- **Same codebase** as iOS/Android native SDKs
- **Consistent 60+ FPS** performance
- Works on damaged, small, distant barcodes
- Low-light environment support

---

# Technology Architecture

| Library | Core Engine | Threading |
|---------|-------------|-----------|
| **Scanbot** | C/C++ → WASM | Web Workers |
| **qr-scanner** | WASM + BarcodeDetector | Web Workers |
| **zbar-wasm** | C (ZBar) → WASM | Supports Workers |
| **html5-qrcode** | JavaScript (zxing-js) | Main Thread ⚠️ |

> **Key Insight:** WebAssembly = Near-native performance

---

# Performance Comparison

| Metric | Scanbot | qr-scanner | zbar-wasm | html5-qrcode |
|--------|:-------:|:----------:|:---------:|:------------:|
| **Avg Scan** | ~40ms | ~29ms | ~35ms | ~47ms |
| **Worst Case** | Stable | Stable | Stable | **1000ms** ⚠️ |
| **Frame Rate** | 60+ FPS | ~34 FPS | ~30 FPS | ~17 FPS |
| **Misreads** | Near 0 | 0 | Low | Occasional |

---

# Why html5-qrcode is Slower

![bg right:35% 90%](https://api.iconify.design/mdi:speedometer-slow.svg?color=%23dc2626)

- ❌ Pure JavaScript (no WebAssembly)
- ❌ Runs on **main thread** (blocks UI)
- ❌ Performance spikes up to **1000ms**
- ❌ Only **17 FPS** vs 34+ FPS
- ❌ Uses unmaintained zxing-js
- ❌ **383 open issues**, no fixes

---

# Bundle Size Comparison

| Library | Minified | Gzipped |
|---------|:--------:|:-------:|
| **qr-scanner** | 59 kB | **16 kB** |
| **qr-scanner** (native) | 15 kB | **5.6 kB** |
| **zbar-wasm** | 330 kB | ~100 kB |
| **html5-qrcode** | 150 kB | ~50 kB |

**Winner:** qr-scanner (smallest footprint)

---

# Supported Formats

| Format | Scanbot | qr-scanner | zbar-wasm | html5-qrcode |
|--------|:-------:|:----------:|:---------:|:------------:|
| QR Code | ✅ | ✅ | ✅ | ✅ |
| Code-128 | ✅ | ❌ | ✅ | ✅ |
| EAN-13 | ✅ | ❌ | ✅ | ✅ |
| UPC-A | ✅ | ❌ | ✅ | ✅ |
| Data Matrix | ✅ | ❌ | ❌ | ✅ |
| PDF-417 | ✅ | ❌ | ❌ | ✅ |
| **Total** | **20+** | **1** | **12** | **16** |

---

# Features Comparison

| Feature | qr-scanner | zbar-wasm | html5-qrcode |
|---------|:----------:|:---------:|:------------:|
| Camera Stream | ✅ | Manual | ✅ |
| Image File Scan | ✅ | ✅ | ✅ |
| Multi-barcode/Frame | ❌ | ✅ | ❌ |
| Flash Control | ✅ | Manual | ✅ |
| Built-in UI | ❌ | ❌ | ✅ |
| TypeScript | ✅ | ✅ | ✅ |

---

# Browser Support

| Browser | qr-scanner | zbar-wasm | html5-qrcode |
|---------|:----------:|:---------:|:------------:|
| Chrome 57+ | ✅ | ✅ | ✅ |
| Firefox 53+ | ✅ | ✅ | ✅ |
| Safari 11+ | ✅ | ✅ | ✅ |
| Edge 16+ | ✅ | ✅ | ✅ |
| iOS Safari | ✅ | ⚠️ | ✅ (15.1+) |
| Android | ✅ | ✅ | ✅ |

> ⚠️ zbar-wasm: Issues on iPhone 14 Pro/Pro Max

---

# API Comparison: qr-scanner

```javascript
import QrScanner from 'qr-scanner';

const scanner = new QrScanner(
  videoElement,
  result => console.log(result.data),
  { highlightScanRegion: true }
);

await scanner.start();
```

✅ Simple API | ✅ WebWorker | ❌ No built-in UI

---

# API Comparison: zbar-wasm

```javascript
import { scanImageData } from 'zbar-wasm';

// Get image data from canvas
const imageData = ctx.getImageData(0, 0, width, height);

// Scan for barcodes
const symbols = await scanImageData(imageData);
symbols.forEach(s => console.log(s.decode()));
```

✅ Multi-format | ✅ WASM | ❌ Manual camera handling

---

# API Comparison: html5-qrcode

```javascript
import { Html5QrcodeScanner } from 'html5-qrcode';

const scanner = new Html5QrcodeScanner("reader", {
  fps: 10,
  qrbox: 250
});

scanner.render(
  (text) => console.log(text),
  (err) => console.warn(err)
);
```

✅ Built-in UI | ✅ Easy setup | ❌ Slow | ❌ Unmaintained

---

# Maintenance Status

| Library | Status | Last Update | Issues |
|---------|:------:|:-----------:|:------:|
| **qr-scanner** | ✅ Active | 2025 | ~30 |
| **zbar-wasm** | ✅ Active | 2024 | ~20 |
| **html5-qrcode** | ❌ Unmaintained | 2023 | **383** |

> ⚠️ **Warning:** html5-qrcode has no active development

---

# Known Issues & Limitations

### qr-scanner
- QR codes only (no barcodes)
- No built-in UI

### zbar-wasm
- iPhone 14 Pro/Pro Max issues
- LGPL license (copyleft)
- 330 kB bundle size

### html5-qrcode
- **Unmaintained** - no bug fixes
- Performance spikes to 1000ms
- Blocks main UI thread

---

# Performance Score vs Scanbot

| Library | Score | Closeness |
|---------|:-----:|:---------:|
| **Scanbot** | 100% | Reference |
| **qr-scanner** | ~85% | Very Close |
| **zbar-wasm** | ~80% | Close |
| **html5-qrcode** | ~50% | Far |

---

# Cost Analysis

| Library | License | Cost |
|---------|---------|:----:|
| **Scanbot** | Commercial | $$$ |
| **qr-scanner** | MIT | Free |
| **zbar-wasm** | LGPL-2.1 | Free |
| **html5-qrcode** | Apache-2.0 | Free |

---

# Recommendation Matrix

| Use Case | Recommended |
|----------|:-----------:|
| **QR Code Only** | qr-scanner ⭐ |
| **Multi-format Barcodes** | zbar-wasm ⭐ |
| **Quick Prototype** | html5-qrcode |
| **Production + Budget** | Scanbot |
| **Smallest Bundle** | qr-scanner |
| **Node.js Support** | zbar-wasm |

---

# Migration from html5-qrcode

### To qr-scanner (QR only):
```bash
npm uninstall html5-qrcode
npm install qr-scanner
```

### To zbar-wasm (Multi-format):
```bash
npm uninstall html5-qrcode
npm install zbar-wasm
```

---

# Final Verdict

## Best Free Alternatives to Scanbot:

| Need | Choice |
|------|--------|
| 🎯 **QR codes only** | **qr-scanner** |
| 📊 **Multiple barcode formats** | **zbar-wasm** |

Both use **WebAssembly** for near-native performance!

---

# Key Takeaways

1. **WebAssembly** is the key to smooth scanning
2. **qr-scanner** is closest to Scanbot for QR codes
3. **zbar-wasm** best for multi-format barcodes
4. **Avoid html5-qrcode** - unmaintained & slow
5. Consider **native BarcodeDetector API** for Android

---

# References

- [Scanbot SDK Docs](https://docs.scanbot.io/barcode-scanner-sdk/web/introduction/)
- [qr-scanner GitHub](https://github.com/nimiq/qr-scanner)
- [zbar-wasm GitHub](https://github.com/undecaf/zbar-wasm)
- [html5-qrcode GitHub](https://github.com/mebjas/html5-qrcode)
- [MDN BarcodeDetector](https://developer.mozilla.org/en-US/docs/Web/API/BarcodeDetector)

---

<!-- _class: lead -->
<!-- _backgroundColor: #2563eb -->
<!-- _color: white -->

# Thank You

**Report Generated:** December 2025

Questions?
