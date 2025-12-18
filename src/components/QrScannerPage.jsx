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
  const [cameras, setCameras] = useState([]);
  const [selectedCamera, setSelectedCamera] = useState('');
  const [camerasLoading, setCamerasLoading] = useState(true);
  const [currentFacingMode, setCurrentFacingMode] = useState(null);
  const [autoZoomEnabled, setAutoZoomEnabled] = useState(true);
  const [focusPoint, setFocusPoint] = useState(null);
  const videoRef = useRef(null);
  const scannerRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);
  const videoContainerRef = useRef(null);
  const lastAutoZoomRef = useRef(0);
  const isAutoZoomingRef = useRef(false);

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

    // 1080p resolution - balance between quality and processing speed
    // 4K causes slower detection due to more pixels to process
    const highResConstraints = {
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    };

    // Progressive constraint fallback - try strictest first
    const constraintsList = [];

    if (preferredDeviceId && preferredDeviceId !== 'environment') {
      // User selected specific camera - try with 4K first, then fallback
      constraintsList.push(
        { video: { deviceId: { exact: preferredDeviceId }, ...highResConstraints } },
        { video: { deviceId: preferredDeviceId, ...highResConstraints } },
        { video: { deviceId: { exact: preferredDeviceId } } },
        { video: { deviceId: preferredDeviceId } }
      );
    }

    // Always try environment facing mode with high resolution
    constraintsList.push(
      // Try exact environment with 4K first
      { video: { facingMode: { exact: 'environment' }, ...highResConstraints } },
      { video: { facingMode: 'environment', ...highResConstraints } },
      // Fallback without resolution constraints
      { video: { facingMode: { exact: 'environment' } } },
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
      console.log('[QR Scanner] Got camera:', settings.facingMode, settings.deviceId);
      console.log('[QR Scanner] Resolution:', settings.width + 'x' + settings.height);
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
    setZoomLevel(2);
    setZoomSupported(false);
    setCurrentFacingMode(null);
  }, [stopAllTracks]);

  useEffect(() => {
    return () => stopScanner();
  }, [stopScanner]);

  // Initialize camera features (zoom, autofocus) after stream is ready
  const initializeCameraFeatures = useCallback(async () => {
    if (!videoRef.current?.srcObject) return;

    const stream = videoRef.current.srcObject;
    const track = stream.getVideoTracks()[0];

    if (!track) return;

    // Check actual facing mode of the active camera
    if (typeof track.getSettings === 'function') {
      const settings = track.getSettings();
      setCurrentFacingMode(settings.facingMode || 'unknown');
    }

    if (typeof track.getCapabilities !== 'function') return;

    const capabilities = track.getCapabilities();
    console.log('[QR Scanner] Camera capabilities:', capabilities);

    // Setup continuous autofocus if supported
    if (capabilities?.focusMode) {
      console.log('[QR Scanner] Available focus modes:', capabilities.focusMode);

      if (capabilities.focusMode.includes('continuous')) {
        try {
          await track.applyConstraints({
            advanced: [{ focusMode: 'continuous' }]
          });
          console.log('[QR Scanner] Continuous autofocus enabled');
        } catch (err) {
          console.log('[QR Scanner] Failed to enable continuous autofocus:', err);
        }
      }
    }

    // Setup zoom if supported
    if (capabilities?.zoom) {
      setZoomSupported(true);
      setZoomRange({ min: capabilities.zoom.min, max: capabilities.zoom.max });

      // Set default zoom to 2x for better QR scanning
      const defaultZoom = Math.min(2, capabilities.zoom.max);
      setZoomLevel(defaultZoom);

      try {
        await track.applyConstraints({ advanced: [{ zoom: defaultZoom }] });
        console.log('[QR Scanner] Default zoom set to:', defaultZoom);
      } catch (err) {
        console.log('[QR Scanner] Failed to apply default zoom:', err);
      }
    }
  }, []);

  // Auto-zoom function - detects small QR codes and zooms in
  const applyAutoZoom = useCallback(async (cornerPoints) => {
    if (!autoZoomEnabled || !zoomSupported || !videoRef.current?.srcObject) return;
    if (isAutoZoomingRef.current) return;

    // Throttle auto-zoom to once every 500ms
    const now = Date.now();
    if (now - lastAutoZoomRef.current < 500) return;

    const video = videoRef.current;
    const frameWidth = video.videoWidth;
    const frameHeight = video.videoHeight;

    if (!cornerPoints || cornerPoints.length < 4) return;

    // Calculate QR code size from corner points
    const minX = Math.min(...cornerPoints.map(p => p.x));
    const maxX = Math.max(...cornerPoints.map(p => p.x));
    const minY = Math.min(...cornerPoints.map(p => p.y));
    const maxY = Math.max(...cornerPoints.map(p => p.y));

    const qrWidth = maxX - minX;
    const qrHeight = maxY - minY;
    const qrSize = Math.max(qrWidth, qrHeight);

    // Calculate QR code size as percentage of frame
    const frameSize = Math.min(frameWidth, frameHeight);
    const qrPercentage = (qrSize / frameSize) * 100;

    console.log(`[QR Scanner] QR size: ${qrSize.toFixed(0)}px (${qrPercentage.toFixed(1)}% of frame)`);

    // If QR code is less than 15% of frame, zoom in
    // If QR code is more than 50% of frame, zoom out a bit
    const targetPercentage = 25; // Ideal QR code size
    const currentZoom = zoomLevel;

    let newZoom = currentZoom;

    if (qrPercentage < 12 && currentZoom < zoomRange.max) {
      // QR too small, zoom in more aggressively
      const zoomFactor = Math.min(targetPercentage / qrPercentage, 2);
      newZoom = Math.min(currentZoom * zoomFactor, zoomRange.max);
      console.log(`[QR Scanner] Auto-zoom IN: ${currentZoom.toFixed(1)}x → ${newZoom.toFixed(1)}x`);
    } else if (qrPercentage > 60 && currentZoom > zoomRange.min) {
      // QR too big, zoom out slightly
      newZoom = Math.max(currentZoom * 0.8, zoomRange.min);
      console.log(`[QR Scanner] Auto-zoom OUT: ${currentZoom.toFixed(1)}x → ${newZoom.toFixed(1)}x`);
    }

    if (Math.abs(newZoom - currentZoom) > 0.2) {
      isAutoZoomingRef.current = true;
      lastAutoZoomRef.current = now;

      try {
        const track = video.srcObject.getVideoTracks()[0];
        if (track) {
          await track.applyConstraints({ advanced: [{ zoom: newZoom }] });
          setZoomLevel(newZoom);
        }
      } catch (err) {
        console.log('[QR Scanner] Auto-zoom failed:', err);
      }

      // Allow next auto-zoom after a delay
      setTimeout(() => {
        isAutoZoomingRef.current = false;
      }, 300);
    }
  }, [autoZoomEnabled, zoomSupported, zoomLevel, zoomRange]);

  // Tap-to-focus handler
  const handleTapToFocus = useCallback(async (event) => {
    if (!videoRef.current?.srcObject || !videoContainerRef.current) return;

    const video = videoRef.current;
    const container = videoContainerRef.current;
    const rect = container.getBoundingClientRect();

    // Calculate tap position relative to video (0-1 range)
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;

    // Show visual feedback
    setFocusPoint({ x: event.clientX - rect.left, y: event.clientY - rect.top });
    setTimeout(() => setFocusPoint(null), 1000);

    const track = video.srcObject.getVideoTracks()[0];
    if (!track) return;

    try {
      const capabilities = track.getCapabilities();

      // Check if point-of-interest focus is supported
      if (capabilities?.focusMode?.includes('manual') || capabilities?.focusMode?.includes('single-shot')) {
        console.log(`[QR Scanner] Tap-to-focus at (${(x * 100).toFixed(1)}%, ${(y * 100).toFixed(1)}%)`);

        // Try to apply focus at the tapped point
        await track.applyConstraints({
          advanced: [{
            focusMode: 'manual',
            pointsOfInterest: [{ x, y }]
          }]
        });

        // After focusing, switch back to continuous after a delay
        setTimeout(async () => {
          try {
            if (capabilities?.focusMode?.includes('continuous')) {
              await track.applyConstraints({
                advanced: [{ focusMode: 'continuous' }]
              });
            }
          } catch (err) {
            console.log('[QR Scanner] Failed to restore continuous focus:', err);
          }
        }, 2000);
      } else if (capabilities?.focusMode?.includes('single-shot')) {
        // Trigger single-shot autofocus
        await track.applyConstraints({
          advanced: [{ focusMode: 'single-shot' }]
        });
        console.log('[QR Scanner] Triggered single-shot autofocus');
      }
    } catch (err) {
      console.log('[QR Scanner] Tap-to-focus not supported:', err.message);
    }
  }, []);

  // Initialize scanner when isScanning becomes true (after fullscreen video mounts)
  const initializeScanner = useCallback(async (cameraId) => {
    try {
      if (!videoRef.current) {
        console.log('[QR Scanner] Video element not ready yet');
        return;
      }

      // Let qr-scanner library handle the camera
      scannerRef.current = new QrScanner(
        videoRef.current,
        (result) => {
          // Auto-zoom based on QR code size
          if (result.cornerPoints && result.cornerPoints.length >= 4) {
            applyAutoZoom(result.cornerPoints);
          }

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
          preferredCamera: cameraId || 'environment',
        }
      );

      await scannerRef.current.start();

      // Update facing mode after camera starts
      setTimeout(async () => {
        if (videoRef.current?.srcObject) {
          const track = videoRef.current.srcObject.getVideoTracks()[0];
          if (track) {
            const settings = track.getSettings();
            setCurrentFacingMode(settings.facingMode || 'unknown');
            console.log('[QR Scanner] Resolution:', settings.width + 'x' + settings.height);
          }
        }
        initializeCameraFeatures();
      }, 300);

    } catch (err) {
      console.error('[QR Scanner] Scanner init error:', err);
      setError(`Failed to start scanner: ${err.message}`);
      setIsScanning(false);
    }
  }, [scanMode, stopScanner, applyAutoZoom, initializeCameraFeatures]);

  // Effect to initialize scanner when isScanning becomes true
  useEffect(() => {
    if (isScanning && videoRef.current && !videoRef.current.srcObject) {
      initializeScanner(selectedCamera);
    }
  }, [isScanning, selectedCamera, initializeScanner]);

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
          initializeCameraFeatures();
        }, 500);
      } catch (err) {
        console.log('Failed to switch camera:', err);
      }
    } else {
      initializeCameraFeatures();
    }
  }, [selectedCamera, initializeCameraFeatures]);

  const startScanner = () => {
    setError(null);
    setScanResult(null);
    setCapturedImage(null);
    setIsScanning(true);
  };

  // Handle camera selection change
  const handleCameraChange = async (newCameraId) => {
    setSelectedCamera(newCameraId);

    if (isScanning && scannerRef.current) {
      try {
        await scannerRef.current.setCamera(newCameraId || 'environment');
        // Update facing mode after camera switch
        setTimeout(() => {
          if (videoRef.current?.srcObject) {
            const track = videoRef.current.srcObject.getVideoTracks()[0];
            if (track) {
              const settings = track.getSettings();
              setCurrentFacingMode(settings.facingMode || 'unknown');
            }
          }
          initializeCameraFeatures();
        }, 300);
      } catch (err) {
        console.error('[QR Scanner] Failed to switch camera:', err);
        setError(`Failed to switch camera: ${err.message}`);
      }
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
    if (currentFacingMode === 'environment') return 'Back Camera';
    if (currentFacingMode === 'user') return 'Front Camera!';
    return 'Unknown';
  };

  // Fullscreen scanner view when scanning
  if (isScanning) {
    return (
      <div className="zxing-fullscreen">
        {/* Fullscreen video */}
        <div
          ref={videoContainerRef}
          style={{ width: '100%', height: '100%', position: 'relative' }}
          onClick={handleTapToFocus}
        >
          <video
            ref={videoRef}
            className="zxing-video"
            playsInline
            muted
          />
          {/* Tap-to-focus indicator */}
          {focusPoint && (
            <div
              className="focus-indicator"
              style={{
                position: 'absolute',
                left: focusPoint.x - 30,
                top: focusPoint.y - 30,
                width: 60,
                height: 60,
                border: '2px solid #ffff00',
                borderRadius: '50%',
                pointerEvents: 'none',
                animation: 'focusPulse 1s ease-out forwards'
              }}
            />
          )}
        </div>

        {/* Top overlay controls */}
        <div className="zxing-top-overlay">
          <div className="zxing-header">
            <span className="zxing-title">QR Scanner</span>
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
              <option key={camera.id} value={camera.id}>
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

          {/* Auto-zoom toggle */}
          <div className="auto-zoom-toggle" style={{ background: 'rgba(255,255,255,0.1)' }}>
            <label>
              <input
                type="checkbox"
                checked={autoZoomEnabled}
                onChange={(e) => setAutoZoomEnabled(e.target.checked)}
              />
              Auto-zoom
            </label>
          </div>

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
      <h1>QR Scanner</h1>

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
              <option key={camera.id} value={camera.id}>
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
          <div className="result-actions">
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
        </div>
      )}
    </div>
  );
};

export default QrScannerPage;
