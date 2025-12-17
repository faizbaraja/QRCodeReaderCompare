import { useEffect, useRef, useState, useCallback } from 'react';
import QrScanner from 'qr-scanner';

const QrScannerPage = () => {
  const [scanResult, setScanResult] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState(null);
  const [scanMode, setScanMode] = useState('live');
  const [capturedImage, setCapturedImage] = useState(null);
  const videoRef = useRef(null);
  const scannerRef = useRef(null);
  const fileInputRef = useRef(null);

  const stopScanner = useCallback(() => {
    if (scannerRef.current) {
      scannerRef.current.stop();
      scannerRef.current.destroy();
      scannerRef.current = null;
    }
    setIsScanning(false);
  }, []);

  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, [stopScanner]);

  const startScanner = async () => {
    try {
      setError(null);
      setScanResult(null);
      setCapturedImage(null);

      if (!videoRef.current) {
        setError('Video element not found');
        return;
      }

      scannerRef.current = new QrScanner(
        videoRef.current,
        (result) => {
          setScanResult(result.data);
          if (scanMode === 'live') {
            stopScanner();
          }
        },
        {
          returnDetailedScanResult: true,
          highlightScanRegion: true,
          highlightCodeOutline: true,
          preferredCamera: 'environment',
        }
      );

      await scannerRef.current.start();
      setIsScanning(true);
    } catch (err) {
      setError(`Failed to start scanner: ${err.message}`);
      setIsScanning(false);
    }
  };

  const captureAndDecode = async () => {
    if (!videoRef.current) {
      setError('Video not ready');
      return;
    }

    try {
      // Create canvas to capture frame
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(videoRef.current, 0, 0);

      // Show captured image
      const imageUrl = canvas.toDataURL('image/png');
      setCapturedImage(imageUrl);

      // Convert to blob for scanning
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));

      try {
        const result = await QrScanner.scanImage(blob, { returnDetailedScanResult: true });
        setScanResult(result.data);
        setError(null);
      } catch (err) {
        setError('No QR code found in the captured image');
        setScanResult(null);
      }
    } catch (err) {
      setError(`Capture failed: ${err.message}`);
    }
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    try {
      setError(null);
      setScanResult(null);

      const imageUrl = URL.createObjectURL(file);
      setCapturedImage(imageUrl);

      try {
        const result = await QrScanner.scanImage(file, { returnDetailedScanResult: true });
        setScanResult(result.data);
      } catch (err) {
        setError('No QR code found in the uploaded image');
      }
    } catch (err) {
      setError(`Upload failed: ${err.message}`);
    }
  };

  const resetScanner = () => {
    setScanResult(null);
    setError(null);
    setCapturedImage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="qr-scanner-container">
      <h1>QR Scanner</h1>

      <div className="mode-selector">
        <button
          className={`mode-btn ${scanMode === 'live' ? 'active' : ''}`}
          onClick={() => {
            setScanMode('live');
            stopScanner();
            resetScanner();
          }}
        >
          Live Scan
        </button>
        <button
          className={`mode-btn ${scanMode === 'capture' ? 'active' : ''}`}
          onClick={() => {
            setScanMode('capture');
            stopScanner();
            resetScanner();
          }}
        >
          Capture & Decode
        </button>
      </div>

      <div className="scanner-area">
        <video
          ref={videoRef}
          style={{
            width: '100%',
            display: isScanning ? 'block' : 'none',
            borderRadius: '8px'
          }}
          playsInline
          muted
        />

        {!isScanning && !capturedImage && (
          <div className="placeholder">
            <p>Camera preview will appear here</p>
          </div>
        )}

        {capturedImage && !isScanning && (
          <div className="captured-image">
            <h3>Captured Image:</h3>
            <img src={capturedImage} alt="Captured" />
          </div>
        )}
      </div>

      <div className="controls">
        {scanMode === 'live' ? (
          <>
            {!isScanning ? (
              <button className="control-btn start" onClick={startScanner}>
                Start Live Scanning
              </button>
            ) : (
              <button className="control-btn stop" onClick={stopScanner}>
                Stop Scanning
              </button>
            )}
          </>
        ) : (
          <>
            {!isScanning ? (
              <div className="capture-controls">
                <button className="control-btn start" onClick={startScanner}>
                  Open Camera
                </button>
                <label className="control-btn upload">
                  Upload Image
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileUpload}
                    ref={fileInputRef}
                    style={{ display: 'none' }}
                  />
                </label>
              </div>
            ) : (
              <div className="capture-controls">
                <button className="control-btn capture" onClick={captureAndDecode}>
                  Capture & Decode
                </button>
                <button className="control-btn stop" onClick={stopScanner}>
                  Close Camera
                </button>
              </div>
            )}
          </>
        )}

        {(scanResult || error || capturedImage) && (
          <button className="control-btn reset" onClick={resetScanner}>
            Reset
          </button>
        )}
      </div>

      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      {scanResult && (
        <div className="result-container">
          <h2>Scan Result:</h2>
          <div className="result-text">{scanResult}</div>
          <button
            className="copy-btn"
            onClick={() => {
              navigator.clipboard.writeText(scanResult);
            }}
          >
            Copy to Clipboard
          </button>
          {scanResult.startsWith('http') && (
            <a
              href={scanResult}
              target="_blank"
              rel="noopener noreferrer"
              className="open-link-btn"
            >
              Open Link
            </a>
          )}
        </div>
      )}
    </div>
  );
};

export default QrScannerPage;
