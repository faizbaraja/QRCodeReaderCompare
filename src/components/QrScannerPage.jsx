import { useEffect, useRef, useState, useCallback } from 'react';
import QrScanner from 'qr-scanner';

const QrScannerPage = () => {
  const [scanResult, setScanResult] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState(null);
  const [scanMode, setScanMode] = useState('live');
  const [capturedImage, setCapturedImage] = useState(null);
  const [zoomLevel, setZoomLevel] = useState(2);
  const [zoomSupported, setZoomSupported] = useState(false);
  const [zoomRange, setZoomRange] = useState({ min: 1, max: 1 });
  const [videoReady, setVideoReady] = useState(false);
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
    setZoomLevel(2);
    setZoomSupported(false);
    setVideoReady(false);
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
          // Capture the frame as image
          if (videoRef.current) {
            const canvas = document.createElement('canvas');
            canvas.width = videoRef.current.videoWidth;
            canvas.height = videoRef.current.videoHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(videoRef.current, 0, 0);
            const imageUrl = canvas.toDataURL('image/png');
            setCapturedImage(imageUrl);
          }
          if (scanMode === 'live') {
            stopScanner();
          }
        },
        {
          returnDetailedScanResult: true,
          highlightScanRegion: true,
          highlightCodeOutline: true,
          preferredCamera: 'environment',
          maxScansPerSecond: 30,
          calculateScanRegion: (video) => {
            const smallestDimension = Math.min(video.videoWidth, video.videoHeight);
            const scanRegionSize = Math.round(smallestDimension * 0.7);
            return {
              x: Math.round((video.videoWidth - scanRegionSize) / 2),
              y: Math.round((video.videoHeight - scanRegionSize) / 2),
              width: scanRegionSize,
              height: scanRegionSize,
              downScaledWidth: 500,
              downScaledHeight: 500,
            };
          },
        }
      );

      await scannerRef.current.start({
        video: {
        facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 }
        }
      });
      setIsScanning(true);

      // Enable scanning of both normal and inverted QR codes
      scannerRef.current.setInversionMode('both');

      // Apply zoom immediately, then show video
      setTimeout(async () => {
        if (videoRef.current && videoRef.current.srcObject) {
          const stream = videoRef.current.srcObject;
          const track = stream.getVideoTracks()[0];
          if (track && typeof track.getCapabilities === 'function') {
            const capabilities = track.getCapabilities();
            if (capabilities && capabilities.zoom) {
              setZoomSupported(true);
              setZoomRange({ min: capabilities.zoom.min, max: capabilities.zoom.max });
              // Set default zoom to 2x
              const defaultZoom = Math.min(2, capabilities.zoom.max);
              setZoomLevel(defaultZoom);
              try {
                await track.applyConstraints({ advanced: [{ zoom: defaultZoom }] });
              } catch (err) {
                console.log('Failed to apply default zoom:', err);
              }
            }
          }
        }
        // Show video after zoom is applied
        setVideoReady(true);
      }, 100);
    } catch (err) {
      setError(`Failed to start scanner: ${err.message}`);
      setIsScanning(false);
    }
  };

  const handleZoomChange = async (newZoom) => {
    setZoomLevel(newZoom);
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject;
      const track = stream.getVideoTracks()[0];
      if (track) {
        try {
          await track.applyConstraints({ advanced: [{ zoom: newZoom }] });
        } catch (err) {
          console.error('Failed to apply zoom:', err);
        }
      }
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
        <div
          className="video-container"
          style={{
            width: '100%',
            height: '100%',
            display: isScanning ? 'block' : 'none',
            position: 'relative'
          }}
        >
          <video
            ref={videoRef}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              borderRadius: '8px',
              opacity: videoReady ? 1 : 0,
              transition: 'opacity 0.3s ease-in-out'
            }}
            playsInline
            muted
          />
        </div>

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

      {isScanning && zoomSupported && (
        <div className="zoom-control">
          <span className="zoom-label">Zoom: {zoomLevel.toFixed(1)}x</span>
          <input
            type="range"
            min={zoomRange.min}
            max={zoomRange.max}
            step="0.1"
            value={zoomLevel}
            onChange={(e) => handleZoomChange(parseFloat(e.target.value))}
            className="zoom-slider"
          />
        </div>
      )}

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
