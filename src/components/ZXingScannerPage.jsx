import { useEffect, useRef, useState, useCallback } from 'react';
import { BrowserQRCodeReader } from '@zxing/browser';
import { NotFoundException } from '@zxing/library';

const ZXingScannerPage = () => {
  const [scanResult, setScanResult] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState(null);
  const [scanMode, setScanMode] = useState('live');
  const [capturedImage, setCapturedImage] = useState(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [zoomSupported, setZoomSupported] = useState(false);
  const [zoomRange, setZoomRange] = useState({ min: 1, max: 1 });
  const [cameras, setCameras] = useState([]);
  const [selectedCamera, setSelectedCamera] = useState('');
  const [camerasLoading, setCamerasLoading] = useState(true);
  const [currentFacingMode, setCurrentFacingMode] = useState(null);

  const videoRef = useRef(null);
  const codeReaderRef = useRef(null);
  const controlsRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);

  // Stop all media tracks
  const stopAllTracks = useCallback(() => {
    if (controlsRef.current) {
      controlsRef.current.stop();
      controlsRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current?.srcObject) {
      const tracks = videoRef.current.srcObject.getTracks();
      tracks.forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
  }, []);

  // Get camera stream with progressive fallback
  const getCameraStream = useCallback(async (preferredDeviceId) => {
    stopAllTracks();

    const constraintsList = [];

    if (preferredDeviceId && preferredDeviceId !== 'environment') {
      constraintsList.push(
        { video: { deviceId: { exact: preferredDeviceId } } },
        { video: { deviceId: preferredDeviceId } }
      );
    }

    constraintsList.push(
      { video: { facingMode: { exact: 'environment' } } },
      { video: { facingMode: 'environment' } },
      { video: true }
    );

    let stream = null;
    let lastError = null;

    for (const constraints of constraintsList) {
      try {
        console.log('[ZXing] Trying constraints:', JSON.stringify(constraints));
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        console.log('[ZXing] Success with constraints:', JSON.stringify(constraints));
        break;
      } catch (err) {
        console.log('[ZXing] Failed with constraints:', JSON.stringify(constraints), err.message);
        lastError = err;
        continue;
      }
    }

    if (!stream) {
      throw lastError || new Error('Could not access any camera');
    }

    const track = stream.getVideoTracks()[0];
    if (track && typeof track.getSettings === 'function') {
      const settings = track.getSettings();
      console.log('[ZXing] Got camera:', settings.facingMode, settings.deviceId);
      setCurrentFacingMode(settings.facingMode || 'unknown');
    }

    streamRef.current = stream;
    return stream;
  }, [stopAllTracks]);

  // Load available cameras
  const loadCameras = useCallback(async () => {
    try {
      setCamerasLoading(true);

      try {
        const initialStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' }
        });
        initialStream.getTracks().forEach(t => t.stop());
      } catch {
        const fallbackStream = await navigator.mediaDevices.getUserMedia({ video: true });
        fallbackStream.getTracks().forEach(t => t.stop());
      }

      const availableCameras = await BrowserQRCodeReader.listVideoInputDevices();

      const backCameras = availableCameras.filter(camera => {
        const label = camera.label.toLowerCase();
        const isFrontCamera =
          label.includes('front') ||
          label.includes('user') ||
          label.includes('face') ||
          label.includes('selfie');
        return !isFrontCamera;
      });

      const sortedCameras = [...backCameras].sort((a, b) => {
        const labelA = a.label.toLowerCase();
        const labelB = b.label.toLowerCase();

        const isSpecialCamera = (label) =>
          label.includes('wide') ||
          label.includes('ultra') ||
          label.includes('telephoto') ||
          label.includes('tele') ||
          label.includes('macro') ||
          label.includes('depth') ||
          label.includes('zoom');

        const aIsSpecial = isSpecialCamera(labelA);
        const bIsSpecial = isSpecialCamera(labelB);

        if (aIsSpecial && !bIsSpecial) return 1;
        if (!aIsSpecial && bIsSpecial) return -1;

        const aIsMain = labelA.includes('main') || labelA.includes('back 0') || labelA.includes('rear 0');
        const bIsMain = labelB.includes('main') || labelB.includes('back 0') || labelB.includes('rear 0');

        if (aIsMain && !bIsMain) return -1;
        if (!aIsMain && bIsMain) return 1;

        return 0;
      });

      const camerasToUse = sortedCameras.length > 0 ? sortedCameras : availableCameras;
      setCameras(camerasToUse);
      setCamerasLoading(false);

      return camerasToUse;
    } catch (err) {
      console.log('[ZXing] Could not list cameras:', err);
      setCamerasLoading(false);
      return [];
    }
  }, []);

  useEffect(() => {
    codeReaderRef.current = new BrowserQRCodeReader();
    loadCameras();

    const handleDeviceChange = () => loadCameras();
    navigator.mediaDevices?.addEventListener('devicechange', handleDeviceChange);

    return () => {
      navigator.mediaDevices?.removeEventListener('devicechange', handleDeviceChange);
      stopAllTracks();
    };
  }, [loadCameras, stopAllTracks]);

  // Initialize camera features - zoom starts at 1.0
  const initializeCameraFeatures = useCallback(async () => {
    if (!videoRef.current?.srcObject) return;

    const stream = videoRef.current.srcObject;
    const track = stream.getVideoTracks()[0];

    if (!track) return;

    if (typeof track.getCapabilities !== 'function') return;

    const capabilities = track.getCapabilities();
    console.log('[ZXing] Camera capabilities:', capabilities);

    // Setup continuous autofocus
    if (capabilities?.focusMode) {
      console.log('[ZXing] Available focus modes:', capabilities.focusMode);

      if (capabilities.focusMode.includes('continuous')) {
        try {
          await track.applyConstraints({
            advanced: [{ focusMode: 'continuous' }]
          });
          console.log('[ZXing] Continuous autofocus enabled');
        } catch (err) {
          console.log('[ZXing] Failed to enable continuous autofocus:', err);
        }
      }
    }

    // Setup zoom - start at 1.0
    if (capabilities?.zoom) {
      setZoomSupported(true);
      setZoomRange({ min: capabilities.zoom.min, max: capabilities.zoom.max });
      setZoomLevel(1);
      console.log('[ZXing] Zoom supported, starting at 1.0x');
    }
  }, []);

  const stopScanner = useCallback(() => {
    stopAllTracks();
    setIsScanning(false);
    setZoomLevel(1);
    setZoomSupported(false);
    setCurrentFacingMode(null);
  }, [stopAllTracks]);

  // Start camera and decoding (called after video element is mounted)
  const initializeScanner = useCallback(async (cameraId) => {
    try {
      if (!videoRef.current) {
        console.log('[ZXing] Video element not ready yet');
        return;
      }

      const stream = await getCameraStream(cameraId);
      videoRef.current.srcObject = stream;
      await videoRef.current.play();

      controlsRef.current = await codeReaderRef.current.decodeFromVideoDevice(
        undefined,
        videoRef.current,
        (result, error) => {
          if (result) {
            const text = result.getText();
            setScanResult(text);

            if (videoRef.current) {
              const canvas = document.createElement('canvas');
              canvas.width = videoRef.current.videoWidth;
              canvas.height = videoRef.current.videoHeight;
              const ctx = canvas.getContext('2d');
              ctx.drawImage(videoRef.current, 0, 0);
              setCapturedImage(canvas.toDataURL('image/png'));
            }

            if (scanMode === 'live') {
              stopScanner();
            }
          }
          if (error && !(error instanceof NotFoundException)) {
            console.error('[ZXing] Scan error:', error);
          }
        }
      );

      setTimeout(initializeCameraFeatures, 300);

    } catch (err) {
      console.error('[ZXing] Scanner init error:', err);
      setError(`Failed to start scanner: ${err.message}`);
      stopAllTracks();
      setIsScanning(false);
    }
  }, [getCameraStream, scanMode, stopScanner, initializeCameraFeatures, stopAllTracks]);

  // Effect to initialize scanner when isScanning becomes true
  useEffect(() => {
    if (isScanning && videoRef.current && !videoRef.current.srcObject) {
      initializeScanner(selectedCamera);
    }
  }, [isScanning, selectedCamera, initializeScanner]);

  const startScanner = () => {
    setError(null);
    setScanResult(null);
    setCapturedImage(null);
    setIsScanning(true);
  };

  const handleCameraChange = async (newCameraId) => {
    setSelectedCamera(newCameraId);

    if (isScanning) {
      // Stop current stream but keep scanning state
      stopAllTracks();
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      // Re-initialize with new camera
      setTimeout(() => {
        initializeScanner(newCameraId);
      }, 100);
    }
  };

  const handleZoomChange = async (newZoom) => {
    setZoomLevel(newZoom);
    if (videoRef.current?.srcObject) {
      const track = videoRef.current.srcObject.getVideoTracks()[0];
      if (track) {
        try {
          await track.applyConstraints({ advanced: [{ zoom: newZoom }] });
        } catch (err) {
          console.error('[ZXing] Failed to apply zoom:', err);
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
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(videoRef.current, 0, 0);

      const imageUrl = canvas.toDataURL('image/png');
      setCapturedImage(imageUrl);

      try {
        const result = await codeReaderRef.current.decodeFromImageUrl(imageUrl);
        setScanResult(result.getText());
        setError(null);
      } catch {
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
        const result = await codeReaderRef.current.decodeFromImageUrl(imageUrl);
        setScanResult(result.getText());
      } catch {
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

  const getCameraStatusLabel = () => {
    if (currentFacingMode === 'environment') return 'Back Camera';
    if (currentFacingMode === 'user') return 'Front Camera!';
    return 'Unknown';
  };

  // Fullscreen scanner view when scanning
  if (isScanning) {
    return (
      <div className="zxing-fullscreen">
        {/* Fullscreen video */}
        <video
          ref={videoRef}
          className="zxing-video"
          playsInline
          muted
        />

        {/* Top overlay controls */}
        <div className="zxing-top-overlay">
          <div className="zxing-header">
            <span className="zxing-title">ZXing Scanner</span>
            <span className={`zxing-camera-badge ${currentFacingMode === 'user' ? 'wrong' : ''}`}>
              {getCameraStatusLabel()}
            </span>
          </div>

          {/* Camera selector */}
          <select
            value={selectedCamera}
            onChange={(e) => handleCameraChange(e.target.value)}
            className="zxing-camera-select"
          >
            <option value="environment">Back Camera (Auto)</option>
            {cameras.map((camera, index) => (
              <option key={camera.deviceId} value={camera.deviceId}>
                {camera.label || `Camera ${index + 1}`}
              </option>
            ))}
          </select>
        </div>

        {/* Center scan frame */}
        <div className="zxing-scan-frame">
          <div className="zxing-corner tl"></div>
          <div className="zxing-corner tr"></div>
          <div className="zxing-corner bl"></div>
          <div className="zxing-corner br"></div>
        </div>

        {/* Bottom overlay controls */}
        <div className="zxing-bottom-overlay">
          {/* Zoom control */}
          {zoomSupported && (
            <div className="zxing-zoom-control">
              <span className="zxing-zoom-label">{zoomLevel.toFixed(1)}x</span>
              <input
                type="range"
                min={zoomRange.min}
                max={zoomRange.max}
                step="0.1"
                value={zoomLevel}
                onChange={(e) => handleZoomChange(parseFloat(e.target.value))}
                className="zxing-zoom-slider"
              />
            </div>
          )}

          {/* Action buttons */}
          <div className="zxing-actions">
            {scanMode === 'capture' && (
              <button className="zxing-btn capture" onClick={captureAndDecode}>
                Capture
              </button>
            )}
            <button className="zxing-btn stop" onClick={stopScanner}>
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Normal view when not scanning
  return (
    <div className="qr-scanner-container">
      <h1>ZXing Scanner</h1>

      <div className="mode-selector">
        <button
          className={`mode-btn ${scanMode === 'live' ? 'active' : ''}`}
          onClick={() => {
            setScanMode('live');
            resetScanner();
          }}
        >
          Live Scan
        </button>
        <button
          className={`mode-btn ${scanMode === 'capture' ? 'active' : ''}`}
          onClick={() => {
            setScanMode('capture');
            resetScanner();
          }}
        >
          Capture & Decode
        </button>
      </div>

      <div className="camera-selector">
        {camerasLoading ? (
          <span className="camera-loading">Detecting cameras...</span>
        ) : (
          <select
            value={selectedCamera}
            onChange={(e) => setSelectedCamera(e.target.value)}
            className="camera-select"
          >
            <option value="environment">Back Camera (Auto)</option>
            {cameras.map((camera, index) => (
              <option key={camera.deviceId} value={camera.deviceId}>
                {camera.label || `Camera ${index + 1}`}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Hidden video element for non-scanning state */}
      <video ref={videoRef} style={{ display: 'none' }} playsInline muted />

      <div className="scanner-area">
        {capturedImage ? (
          <div className="captured-image">
            <h3>Captured Image:</h3>
            <img src={capturedImage} alt="Captured" />
          </div>
        ) : (
          <div className="placeholder">
            <p>Camera preview will appear here</p>
          </div>
        )}
      </div>

      <div className="controls">
        {scanMode === 'live' ? (
          <button className="control-btn start" onClick={startScanner}>
            Start Live Scanning
          </button>
        ) : (
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

export default ZXingScannerPage;
