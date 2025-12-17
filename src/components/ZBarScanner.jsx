import { useEffect, useRef, useState, useCallback } from 'react';
import { scanImageData } from '@undecaf/zbar-wasm';

const ZBarScanner = () => {
  const [scanResult, setScanResult] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState(null);
  const [scanMode, setScanMode] = useState('live');
  const [capturedImage, setCapturedImage] = useState(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const animationRef = useRef(null);
  const fileInputRef = useRef(null);

  const stopCamera = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsScanning(false);
  }, []);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  const scanFrame = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || !isScanning) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);

      try {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const symbols = await scanImageData(imageData);

        if (symbols.length > 0) {
          const result = symbols[0].decode();
          setScanResult(result);
          if (scanMode === 'live') {
            stopCamera();
            return;
          }
        }
      } catch (err) {
        // Ignore scan errors during continuous scanning
      }
    }

    if (isScanning) {
      animationRef.current = requestAnimationFrame(scanFrame);
    }
  }, [isScanning, scanMode, stopCamera]);

  useEffect(() => {
    if (isScanning) {
      animationRef.current = requestAnimationFrame(scanFrame);
    }
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isScanning, scanFrame]);

  const startCamera = async () => {
    try {
      setError(null);
      setScanResult(null);
      setCapturedImage(null);

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setIsScanning(true);
    } catch (err) {
      setError(`Failed to start camera: ${err.message}`);
      setIsScanning(false);
    }
  };

  const captureAndDecode = async () => {
    if (!videoRef.current || !canvasRef.current) {
      setError('Camera not ready');
      return;
    }

    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);

      // Show captured image
      const imageUrl = canvas.toDataURL('image/png');
      setCapturedImage(imageUrl);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const symbols = await scanImageData(imageData);

      if (symbols.length > 0) {
        const result = symbols[0].decode();
        setScanResult(result);
        setError(null);
      } else {
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

      // Create image element to load the file
      const img = new Image();
      img.onload = async () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

        try {
          const symbols = await scanImageData(imageData);
          if (symbols.length > 0) {
            const result = symbols[0].decode();
            setScanResult(result);
          } else {
            setError('No QR code found in the uploaded image');
          }
        } catch (err) {
          setError('Failed to scan the image');
        }

        URL.revokeObjectURL(imageUrl);
      };

      img.onerror = () => {
        setError('Failed to load the image');
        URL.revokeObjectURL(imageUrl);
      };

      img.src = imageUrl;
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
      <h1>ZBar WASM Scanner</h1>

      <div className="mode-selector">
        <button
          className={`mode-btn ${scanMode === 'live' ? 'active' : ''}`}
          onClick={() => {
            setScanMode('live');
            stopCamera();
            resetScanner();
          }}
        >
          Live Scan
        </button>
        <button
          className={`mode-btn ${scanMode === 'capture' ? 'active' : ''}`}
          onClick={() => {
            setScanMode('capture');
            stopCamera();
            resetScanner();
          }}
        >
          Capture & Decode
        </button>
      </div>

      <div className="scanner-area">
        <video
          ref={videoRef}
          style={{ width: '100%', display: isScanning ? 'block' : 'none' }}
          playsInline
          muted
        />
        <canvas ref={canvasRef} style={{ display: 'none' }} />

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
              <button className="control-btn start" onClick={startCamera}>
                Start Live Scanning
              </button>
            ) : (
              <button className="control-btn stop" onClick={stopCamera}>
                Stop Scanning
              </button>
            )}
          </>
        ) : (
          <>
            <div className="capture-controls">
              {!isScanning ? (
                <button className="control-btn start" onClick={startCamera}>
                  Open Camera
                </button>
              ) : (
                <>
                  <button className="control-btn capture" onClick={captureAndDecode}>
                    Capture & Decode
                  </button>
                  <button className="control-btn stop" onClick={stopCamera}>
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

export default ZBarScanner;
