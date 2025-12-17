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
  const videoRef = useRef(null);
  const scannerRef = useRef(null);
  const fileInputRef = useRef(null);

  // Get available cameras with proper facingMode detection
  const getCamerasWithFacingMode = useCallback(async () => {
    try {
      setCamerasLoading(true);

      // Request permission with environment facing mode first (back camera)
      // This ensures we get proper access to back cameras on Android
      try {
        const initialStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' }
        });
        initialStream.getTracks().forEach(t => t.stop());
      } catch {
        // Fallback to any camera if environment not available
        const fallbackStream = await navigator.mediaDevices.getUserMedia({ video: true });
        fallbackStream.getTracks().forEach(t => t.stop());
      }

      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(device => device.kind === 'videoinput');

      // Get actual facingMode for each camera using getSettings()
      // getSettings() is more reliable than getCapabilities() on Android Chrome
      const camerasWithFacing = await Promise.all(
        videoDevices.map(async (device) => {
          try {
            const stream = await navigator.mediaDevices.getUserMedia({
              video: { deviceId: { exact: device.deviceId } }
            });
            const track = stream.getVideoTracks()[0];
            let facingMode = 'unknown';

            if (track) {
              // Try getSettings() first - more reliable for current state
              if (typeof track.getSettings === 'function') {
                const settings = track.getSettings();
                if (settings?.facingMode) {
                  facingMode = settings.facingMode;
                }
              }

              // Fallback to getCapabilities() if getSettings didn't work
              if (facingMode === 'unknown' && typeof track.getCapabilities === 'function') {
                const capabilities = track.getCapabilities();
                if (capabilities?.facingMode) {
                  facingMode = Array.isArray(capabilities.facingMode)
                    ? capabilities.facingMode[0]
                    : capabilities.facingMode;
                }
              }

              // Final fallback: check label for hints
              if (facingMode === 'unknown') {
                const label = device.label.toLowerCase();
                if (label.includes('back') || label.includes('rear') || label.includes('environment')) {
                  facingMode = 'environment';
                } else if (label.includes('front') || label.includes('user') || label.includes('face')) {
                  facingMode = 'user';
                }
              }
            }

            // Stop the temporary stream
            track.stop();
            stream.getTracks().forEach(t => t.stop());

            return {
              deviceId: device.deviceId,
              label: device.label || `Camera ${device.deviceId.slice(0, 4)}`,
              facingMode
            };
          } catch (err) {
            console.log(`Could not get capabilities for camera ${device.deviceId}:`, err);
            return {
              deviceId: device.deviceId,
              label: device.label || `Camera ${device.deviceId.slice(0, 4)}`,
              facingMode: 'unknown'
            };
          }
        })
      );

      // Filter only back cameras (environment)
      // Exclude front cameras (user)
      const backCameras = camerasWithFacing.filter(
        c => c.facingMode === 'environment'
      );

      // If no confirmed back cameras, include unknown ones (for desktop/fallback)
      // but still exclude confirmed front cameras
      const availableCameras = backCameras.length > 0
        ? backCameras
        : camerasWithFacing.filter(c => c.facingMode !== 'user');

      // If still nothing, use all cameras as last resort
      const finalCameras = availableCameras.length > 0 ? availableCameras : camerasWithFacing;

      setCameras(finalCameras);

      // Select the first back camera as default (best for QR scanning)
      const defaultCamera = finalCameras.find(c => c.facingMode === 'environment')
        || finalCameras[0];

      if (defaultCamera && !selectedCamera) {
        setSelectedCamera(defaultCamera.deviceId);
      }

      setCamerasLoading(false);
      return finalCameras;
    } catch (err) {
      console.log('Could not enumerate cameras:', err);
      setCamerasLoading(false);
      return [];
    }
  }, [selectedCamera]);

  // Get cameras on mount
  useEffect(() => {
    getCamerasWithFacingMode();

    // Listen for camera changes (device connected/disconnected)
    const handleDeviceChange = () => {
      getCamerasWithFacingMode();
    };

    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);

    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
    };
  }, [getCamerasWithFacingMode]);

  const stopScanner = useCallback(() => {
    if (scannerRef.current) {
      scannerRef.current.stop();
      scannerRef.current.destroy();
      scannerRef.current = null;
    }
    setIsScanning(false);
    setZoomLevel(1);
    setZoomSupported(false);
  }, []);

  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, [stopScanner]);

  // Initialize zoom capabilities when video stream is ready
  const initializeZoom = useCallback(async () => {
    if (!videoRef.current?.srcObject) return;

    const stream = videoRef.current.srcObject;
    const track = stream.getVideoTracks()[0];

    if (!track || typeof track.getCapabilities !== 'function') {
      console.log('Zoom not supported: getCapabilities not available');
      return;
    }

    const capabilities = track.getCapabilities();

    if (capabilities?.zoom) {
      setZoomSupported(true);
      setZoomRange({ min: capabilities.zoom.min, max: capabilities.zoom.max });

      // Set default zoom to 2x (or max if less than 2)
      const defaultZoom = Math.min(2, capabilities.zoom.max);
      setZoomLevel(defaultZoom);

      try {
        await track.applyConstraints({ advanced: [{ zoom: defaultZoom }] });
      } catch (err) {
        console.log('Failed to apply default zoom:', err);
      }
    } else {
      console.log('Zoom not supported on this camera');
      setZoomSupported(false);
    }
  }, []);

  const startScanner = async () => {
    try {
      setError(null);
      setScanResult(null);
      setCapturedImage(null);

      if (!videoRef.current) {
        setError('Video element not found');
        return;
      }

      // Find the selected camera's facing mode
      const selectedCameraInfo = cameras.find(c => c.deviceId === selectedCamera);
      const isConfirmedBackCamera = selectedCameraInfo?.facingMode === 'environment';

      const scannerOptions = {
        returnDetailedScanResult: true,
        highlightScanRegion: true,
        highlightCodeOutline: true,
      };

      // Always prefer 'environment' facingMode for reliability on Android
      // Only use deviceId if we have multiple confirmed back cameras
      if (selectedCamera && isConfirmedBackCamera && cameras.filter(c => c.facingMode === 'environment').length > 1) {
        // Multiple back cameras - use specific deviceId
        scannerOptions.preferredCamera = selectedCamera;
      } else {
        // Default to environment facingMode for best compatibility
        scannerOptions.preferredCamera = 'environment';
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
        scannerOptions
      );

      // Set up event listener for when video metadata is loaded
      const handleLoadedMetadata = () => {
        // Small delay to ensure stream is fully ready
        setTimeout(initializeZoom, 100);
      };

      videoRef.current.addEventListener('loadedmetadata', handleLoadedMetadata);

      await scannerRef.current.start();
      setIsScanning(true);

      // Also try to initialize zoom after start (fallback if event already fired)
      if (videoRef.current.readyState >= 1) {
        setTimeout(initializeZoom, 100);
      }
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

      <div className="camera-selector">
        {camerasLoading ? (
          <span className="camera-loading">Detecting cameras...</span>
        ) : cameras.length === 0 ? (
          <span className="camera-error">No back cameras found</span>
        ) : cameras.length === 1 ? (
          <span className="camera-single">{cameras[0].label}</span>
        ) : (
          <select
            value={selectedCamera}
            onChange={(e) => {
              setSelectedCamera(e.target.value);
              if (isScanning) {
                stopScanner();
              }
            }}
            className="camera-select"
          >
            {cameras.map((camera, index) => (
              <option key={camera.deviceId} value={camera.deviceId}>
                {camera.label || `Camera ${index + 1}`}
              </option>
            ))}
          </select>
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
