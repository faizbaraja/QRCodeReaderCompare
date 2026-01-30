import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom'
import QRCodeScanner from './components/QRCodeScanner'
import QrScannerPage from './components/QrScannerPage'
import ReverseGeocoding from './components/ReverseGeocoding'
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
      <Link
        to="/html5"
        className={`nav-link ${location.pathname === '/html5' ? 'active' : ''}`}
      >
        Html5-QRCode
      </Link>
      <Link
        to="/geocoding"
        className={`nav-link ${location.pathname === '/geocoding' ? 'active' : ''}`}
      >
        Reverse Geocoding
      </Link>
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
          <Route path="/html5" element={<QRCodeScanner />} />
          <Route path="/geocoding" element={<ReverseGeocoding />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}

export default App
