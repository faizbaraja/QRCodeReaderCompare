import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom'
import QRCodeScanner from './components/QRCodeScanner'
import ZBarScanner from './components/ZBarScanner'
import './App.css'

function Navigation() {
  const location = useLocation()

  return (
    <nav className="nav-container">
      <Link
        to="/"
        className={`nav-link ${location.pathname === '/' ? 'active' : ''}`}
      >
        Html5-QRCode
      </Link>
      <Link
        to="/zbar"
        className={`nav-link ${location.pathname === '/zbar' ? 'active' : ''}`}
      >
        ZBar WASM
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
          <Route path="/" element={<QRCodeScanner />} />
          <Route path="/zbar" element={<ZBarScanner />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}

export default App
