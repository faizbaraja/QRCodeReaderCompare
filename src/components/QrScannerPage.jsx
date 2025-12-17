import { useEffect, useRef, useState, useCallback } from 'react';
import QrScanner from 'qr-scanner';

const QrScannerPage = () => {
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
  const scannerRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);

  // Stop all media tracks - important for releasing camera
  const stopAllTracks = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        track.stop();
      });
      streamRef.current = null;
    }
    if (videoRef.current?.srcObject) {
      const tracks = videoRef.current.srcObject.getTracks();
      tracks.forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
  }, []);

  // Get camera stream with progressive fallback
  // This gives us full control over camera selection
  const getCameraStream = useCallback(async (preferredDeviceId) => {
    // Stop any existing streams first
    stopAllTracks();

    // Progressive constraint fallback - try strictest first
    const constraintsList = [];

    if (preferredDeviceId && preferredDeviceId !== 'environment') {
      // User selected specific camera
      constraintsList.push(
        { video: { deviceId: { exact: preferredDeviceId } } },
        { video: { deviceId: preferredDeviceId } }
      );
    }

    // Always try environment facing mode
    constraintsList.push(
      // Try exact environment first - fails if no back camera
      { video: { facingMode: { exact: 'environment' } } },
      // Try ideal environment - may fall back
      { video: { facingMode: 'environment' } },
      // Last resort - any camera
      { video: true }
    );

    let stream = null;
    let lastError = null;

    for (const constraints of constraintsList) {
      try {
        console.log('Trying constraints:', JSON.stringify(constraints));
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        console.log('Success with constraints:', JSON.stringify(constraints));
        break;
      } catch (err) {
        console.log('Failed with constraints:', JSON.stringify(constraints), err.message);
        lastError = err;
        continue;
      }
    }

    if (!stream) {
      throw lastError || new Error('Could not access any camera');
    }

    // Verify what camera we got
    const track = stream.getVideoTracks()[0];
    if (track && typeof track.getSettings === 'function') {
      const settings = track.getSettings();
      console.log('Got camera:', settings.facingMode, settings.deviceId);
      setCurrentFacingMode(settings.facingMode || 'unknown');
    }

    streamRef.current = stream;
    return stream;
  }, [stopAllTracks]);

  // Use qr-scanner's built-in listCameras method - much more reliable
  const loadCameras = useCallback(async () => {
    try {
      setCamerasLoading(true);

      // Use qr-scanner's built-in method to list cameras
      // This handles permission request internally
      const availableCameras = await QrScanner.listCameras(true);

      // Filter to only show back cameras based on label
      // The library returns cameras with proper labels after permission
      const backCameras = availableCameras.filter(camera => {
        const label = camera.label.toLowerCase();
        // Exclude cameras that are clearly front-facing
        const isFrontCamera =
          label.includes('front') ||
          label.includes('user') ||
          label.includes('face') ||
          label.includes('selfie');
        return !isFrontCamera;
      });

      // Sort cameras to put the best QR scanning camera first
      // Priority: main camera > others (exclude wide/ultra/telephoto/macro)
      const sortedBackCameras = [...backCameras].sort((a, b) => {
        const labelA = a.label.toLowerCase();
        const labelB = b.label.toLowerCase();

        // Cameras to deprioritize for QR scanning
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

        // Prefer non-special cameras (main camera)
        if (aIsSpecial && !bIsSpecial) return 1;
        if (!aIsSpecial && bIsSpecial) return -1;

        // If both are same type, prefer ones with "main" or "back" in name
        const aIsMain = labelA.includes('main') || labelA.includes('back 0') || labelA.includes('rear 0');
        const bIsMain = labelB.includes('main') || labelB.includes('back 0') || labelB.includes('rear 0');

        if (aIsMain && !bIsMain) return -1;
        if (!aIsMain && bIsMain) return 1;

        return 0;
      });

      // Use filtered cameras, or all if no back cameras found
      const camerasToUse = sortedBackCameras.length > 0 ? sortedBackCameras : availableCameras;

      setCameras(camerasToUse);
      setCamerasLoading(false);

      return camerasToUse;
    } catch (err) {
      console.log('Could not list cameras:', err);
      setCamerasLoading(false);
      return [];
    }
  }, []);

  // Load cameras on mount
  useEffect(() => {
    loadCameras();

    // Listen for camera changes
    const handleDeviceChange = () => loadCameras();
    navigator.mediaDevices?.addEventListener('devicechange', handleDeviceChange);

    return () => {
      navigator.mediaDevices?.removeEventListener('devicechange', handleDeviceChange);
    };
  }, [loadCameras]);

  const stopScanner = useCallback(() => {
    if (scannerRef.current) {
      scannerRef.current.stop();
      scannerRef.current.destroy();
      scannerRef.current = null;
    }
    stopAllTracks();
    setIsScanning(false);
    setZoomLevel(1);
    setZoomSupported(false);
    setCurrentFacingMode(null);
  }, [stopAllTracks]);

  useEffect(() => {
    return () => stopScanner();
  }, [stopScanner]);

  // Initialize zoom after camera is ready
  const initializeZoom = useCallback(async () => {
    if (!videoRef.current?.srcObject) return;

    const stream = videoRef.current.srcObject;
    const track = stream.getVideoTracks()[0];

    if (!track) return;

    // Check actual facing mode of the active camera
    if (typeof track.getSettings === 'function') {
      const settings = track.getSettings();
      setCurrentFacingMode(settings.facingMode || 'unknown');
    }

    // Setup zoom if supported
    if (typeof track.getCapabilities === 'function') {
      const capabilities = track.getCapabilities();

      if (capabilities?.zoom) {
        setZoomSupported(true);
        setZoomRange({ min: capabilities.zoom.min, max: capabilities.zoom.max });

        // Set default zoom to 2x for better QR scanning
        const defaultZoom = Math.min(2, capabilities.zoom.max);
        setZoomLevel(defaultZoom);

        try {
          await track.applyConstraints({ advanced: [{ zoom: defaultZoom }] });
        } catch (err) {
          console.log('Failed to apply default zoom:', err);
        }
      }
    }
  }, []);

  // Verify camera is back-facing after start, retry if not
  const verifyCameraAndRetry = useCallback(async () => {
    if (!videoRef.current?.srcObject || !scannerRef.current) return;

    const stream = videoRef.current.srcObject;
    const track = stream.getVideoTracks()[0];

    if (!track || typeof track.getSettings !== 'function') return;

    const settings = track.getSettings();
    const facingMode = settings.facingMode;

    setCurrentFacingMode(facingMode || 'unknown');

    // If we got front camera but wanted back, try to switch
    if (facingMode === 'user' && selectedCamera === 'environment') {
      console.log('Got front camera, attempting to switch to back camera...');

      try {
        // Try using setCamera to switch to environment
        await scannerRef.current.setCamera('environment');

        // Re-check after switch
        setTimeout(async () => {
          if (videoRef.current?.srcObject) {
            const newTrack = videoRef.current.srcObject.getVideoTracks()[0];
            if (newTrack && typeof newTrack.getSettings === 'function') {
              const newSettings = newTrack.getSettings();
              setCurrentFacingMode(newSettings.facingMode || 'unknown');
            }
          }
          initializeZoom();
        }, 500);
      } catch (err) {
        console.log('Failed to switch camera:', err);
      }
    } else {
      initializeZoom();
    }
  }, [selectedCamera, initializeZoom]);

  const startScanner = async () => {
    try {
      setError(null);
      setScanResult(null);
      setCapturedImage(null);

      if (!videoRef.current) {
        setError('Video element not found');
        return;
      }

      // STEP 1: Manually get camera stream with our controlled constraints
      // This bypasses qr-scanner's camera handling for more reliability
      const stream = await getCameraStream(selectedCamera);

      // STEP 2: Attach stream to video element ourselves
      videoRef.current.srcObject = stream;
      await videoRef.current.play();

      // STEP 3: Create qr-scanner WITHOUT letting it handle camera
      // Pass video element that already has our stream
      scannerRef.current = new QrScanner(
        videoRef.current,
        (result) => {
          setScanResult(result.data);
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
        },
        {
          returnDetailedScanResult: true,
          highlightScanRegion: true,
          highlightCodeOutline: true,
        }
      );

      // Start scanning (but we already have the video stream)
      await scannerRef.current.start();
      setIsScanning(true);

      // Initialize zoom after stream is ready
      setTimeout(initializeZoom, 300);

    } catch (err) {
      console.error('Scanner start error:', err);
      setError(`Failed to start scanner: ${err.message}`);
      stopAllTracks();
      setIsScanning(false);
    }
  };

  // Handle camera selection change - restart with new camera
  const handleCameraChange = async (newCameraId) => {
    setSelectedCamera(newCameraId);

    // If scanning, restart with new camera
    if (isScanning) {
      stopScanner();
      // Small delay to ensure cleanup
      setTimeout(async () => {
        try {
          const stream = await getCameraStream(newCameraId);
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            await videoRef.current.play();

            scannerRef.current = new QrScanner(
              videoRef.current,
              (result) => {
                setScanResult(result.data);
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
              },
              {
                returnDetailedScanResult: true,
                highlightScanRegion: true,
                highlightCodeOutline: true,
              }
            );

            await scannerRef.current.start();
            setIsScanning(true);
            setTimeout(initializeZoom, 300);
          }
        } catch (err) {
          console.error('Failed to switch camera:', err);
          setError(`Failed to switch camera: ${err.message}`);
        }
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
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(videoRef.current, 0, 0);

      const imageUrl = canvas.toDataURL('image/png');
      setCapturedImage(imageUrl);

      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));

      try {
        const result = await QrScanner.scanImage(blob, { returnDetailedScanResult: true });
        setScanResult(result.data);
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
        const result = await QrScanner.scanImage(file, { returnDetailedScanResult: true });
        setScanResult(result.data);
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

  // Get display label for current camera state
  const getCameraStatusLabel = () => {
    if (currentFacingMode === 'environment') return '(Back Camera)';
    if (currentFacingMode === 'user') return '(Front Camera - Wrong!)';
    return '';
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

      <div className="camera-selector">
        {camerasLoading ? (
          <span className="camera-loading">Detecting cameras...</span>
        ) : (
          <select
            value={selectedCamera}
            onChange={(e) => handleCameraChange(e.target.value)}
            className="camera-select"
          >
            <option value="environment">Back Camera (Auto)</option>
            {cameras.map((camera, index) => (
              <option key={camera.id} value={camera.id}>
                {camera.label || `Camera ${index + 1}`}
              </option>
            ))}
          </select>
        )}
        {isScanning && currentFacingMode && (
          <span className={`camera-status ${currentFacingMode === 'user' ? 'wrong' : 'correct'}`}>
            {getCameraStatusLabel()}
          </span>
        )}
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
              borderRadius: '8px'
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
