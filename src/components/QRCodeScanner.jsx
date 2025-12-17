import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

const QRCodeScanner = () => {
  const [scanResult, setScanResult] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState(null);
  const [scanMode, setScanMode] = useState('live'); // 'live' or 'capture'
  const [capturedImage, setCapturedImage] = useState(null);
  const scannerRef = useRef(null);
  const html5QrCodeRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, []);

  const startScanner = async () => {
    try {
      setError(null);
      setScanResult(null);
      setCapturedImage(null);

      if (!html5QrCodeRef.current) {
        html5QrCodeRef.current = new Html5Qrcode('qr-reader');
      }

      const config = {
        fps: 10,
        qrbox: { width: 250, height: 250 },
        aspectRatio: 1.0,
      };

      await html5QrCodeRef.current.start(
        { facingMode: 'environment' },
        config,
        (decodedText, decodedResult) => {
          setScanResult(decodedText);
          if (scanMode === 'live') {
            stopScanner();
          }
        },
        (errorMessage) => {
          // Ignore scan errors - they happen frequently when no QR code is visible
        }
      );

      setIsScanning(true);
    } catch (err) {
      setError(`Failed to start scanner: ${err.message}`);
      setIsScanning(false);
    }
  };

  const stopScanner = async () => {
    if (html5QrCodeRef.current && isScanning) {
      try {
        await html5QrCodeRef.current.stop();
        setIsScanning(false);
      } catch (err) {
        console.error('Error stopping scanner:', err);
      }
    }
  };

  const captureAndDecode = async () => {
    if (!html5QrCodeRef.current || !isScanning) {
      setError('Please start the camera first');
      return;
    }

    try {
      // Get the video element
      const videoElement = document.querySelector('#qr-reader video');
      if (!videoElement) {
        setError('Video element not found');
        return;
      }

      // Create a canvas to capture the frame
      const canvas = document.createElement('canvas');
      canvas.width = videoElement.videoWidth;
      canvas.height = videoElement.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(videoElement, 0, 0);

      // Convert to blob and decode
      canvas.toBlob(async (blob) => {
        if (blob) {
          const imageUrl = URL.createObjectURL(blob);
          setCapturedImage(imageUrl);

          try {
            const file = new File([blob], 'capture.png', { type: 'image/png' });
            const result = await html5QrCodeRef.current.scanFile(file, true);
            setScanResult(result);
            setError(null);
          } catch (err) {
            setError('No QR code found in the captured image');
            setScanResult(null);
          }
        }
      }, 'image/png');
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

      // Show preview
      const imageUrl = URL.createObjectURL(file);
      setCapturedImage(imageUrl);

      if (!html5QrCodeRef.current) {
        html5QrCodeRef.current = new Html5Qrcode('qr-reader-hidden');
      }

      const result = await html5QrCodeRef.current.scanFile(file, true);
      setScanResult(result);
    } catch (err) {
      setError('No QR code found in the uploaded image');
      setScanResult(null);
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
      <h1>QR Code Scanner</h1>

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
        <div id="qr-reader" ref={scannerRef}></div>
        <div id="qr-reader-hidden" style={{ display: 'none' }}></div>

        {capturedImage && (
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
            <div className="capture-controls">
              {!isScanning ? (
                <button className="control-btn start" onClick={startScanner}>
                  Open Camera
                </button>
              ) : (
                <>
                  <button className="control-btn capture" onClick={captureAndDecode}>
                    Capture & Decode
                  </button>
                  <button className="control-btn stop" onClick={stopScanner}>
                    Close Camera
                  </button>
                </>
              )}
            </div>
            <div className="upload-section">
              <span className="divider">or</span>
              <label className="upload-btn">
                Upload QR Image
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  ref={fileInputRef}
                  style={{ display: 'none' }}
                />
              </label>
            </div>
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

export default QRCodeScanner;
