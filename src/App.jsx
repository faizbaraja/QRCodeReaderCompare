import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom'
// import QRCodeScanner from './components/QRCodeScanner'
// import ZBarScanner from './components/ZBarScanner'
import QrScannerPage from './components/QrScannerPage'
// import ZXingScannerPage from './components/ZXingScannerPage'
import './App.css'

function Navigation() {
  const location = useLocation()

  return (
    <nav className="nav-container">
      <Link
        to="/"
        className={`nav-link ${location.pathname === '/' ? 'active' : ''}`}
      >
        QR Scanner
      </Link>
      {/* <Link
        to="/zbar"
        className={`nav-link ${location.pathname === '/zbar' ? 'active' : ''}`}
      >
        ZBar WASM
      </Link>
      <Link
        to="/qr-scanner"
        className={`nav-link ${location.pathname === '/qr-scanner' ? 'active' : ''}`}
      >
        QR Scanner
      </Link>
      <Link
        to="/zxing"
        className={`nav-link ${location.pathname === '/zxing' ? 'active' : ''}`}
      >
        ZXing
      </Link> */}
    </nav>
  )
}

function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <Navigation />
        <Routes>
          <Route path="/" element={<QrScannerPage />} />
          {/* <Route path="/" element={<QRCodeScanner />} />
          <Route path="/zbar" element={<ZBarScanner />} />
          <Route path="/qr-scanner" element={<QrScannerPage />} />
          <Route path="/zxing" element={<ZXingScannerPage />} /> */}
        </Routes>
      </div>
    </BrowserRouter>
  )
}

export default App
