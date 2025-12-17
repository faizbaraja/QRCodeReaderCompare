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

  // Stop all media tracks - important for releasing camera
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

    // Always try environment facing mode with progressive fallback
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

    // Verify what camera we got
    const track = stream.getVideoTracks()[0];
    if (track && typeof track.getSettings === 'function') {
      const settings = track.getSettings();
      console.log('[ZXing] Got camera:', settings.facingMode, settings.deviceId);
      setCurrentFacingMode(settings.facingMode || 'unknown');
    }

    streamRef.current = stream;
    return stream;
  }, [stopAllTracks]);

  // Load available cameras using ZXing's method
  const loadCameras = useCallback(async () => {
    try {
      setCamerasLoading(true);

      // Request permission first
      try {
        const initialStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' }
        });
        initialStream.getTracks().forEach(t => t.stop());
      } catch {
        const fallbackStream = await navigator.mediaDevices.getUserMedia({ video: true });
        fallbackStream.getTracks().forEach(t => t.stop());
      }

      // Use ZXing's built-in method to list cameras
      const availableCameras = await BrowserQRCodeReader.listVideoInputDevices();

      // Filter out front-facing cameras
      const backCameras = availableCameras.filter(camera => {
        const label = camera.label.toLowerCase();
        const isFrontCamera =
          label.includes('front') ||
          label.includes('user') ||
          label.includes('face') ||
          label.includes('selfie');
        return !isFrontCamera;
      });

      // Sort to prefer main camera (deprioritize wide/telephoto/macro)
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

  // Initialize ZXing reader and load cameras on mount
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

  // Initialize zoom after stream is ready
  const initializeZoom = useCallback(async () => {
    if (!videoRef.current?.srcObject) return;

    const stream = videoRef.current.srcObject;
    const track = stream.getVideoTracks()[0];

    if (!track) return;

    if (typeof track.getCapabilities === 'function') {
      const capabilities = track.getCapabilities();

      if (capabilities?.zoom) {
        setZoomSupported(true);
        setZoomRange({ min: capabilities.zoom.min, max: capabilities.zoom.max });

        const defaultZoom = Math.min(2, capabilities.zoom.max);
        setZoomLevel(defaultZoom);

        try {
          await track.applyConstraints({ advanced: [{ zoom: defaultZoom }] });
        } catch (err) {
          console.log('[ZXing] Failed to apply default zoom:', err);
        }
      }
    }
  }, []);

  const stopScanner = useCallback(() => {
    stopAllTracks();
    setIsScanning(false);
    setZoomLevel(1);
    setZoomSupported(false);
    setCurrentFacingMode(null);
  }, [stopAllTracks]);

  const startScanner = async () => {
    try {
      setError(null);
      setScanResult(null);
      setCapturedImage(null);

      if (!videoRef.current) {
        setError('Video element not found');
        return;
      }

      // STEP 1: Manually get camera stream with exact environment constraint
      const stream = await getCameraStream(selectedCamera);

      // STEP 2: Attach stream to video element
      videoRef.current.srcObject = stream;
      await videoRef.current.play();

      // STEP 3: Start ZXing decoding from the video element
      controlsRef.current = await codeReaderRef.current.decodeFromVideoDevice(
        undefined, // Don't let ZXing handle camera - we already have stream
        videoRef.current,
        (result, error) => {
          if (result) {
            const text = result.getText();
            setScanResult(text);

            // Capture frame
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
          // Ignore NotFoundException - happens when no QR code visible
          if (error && !(error instanceof NotFoundException)) {
            console.error('[ZXing] Scan error:', error);
          }
        }
      );

      setIsScanning(true);
      setTimeout(initializeZoom, 300);

    } catch (err) {
      console.error('[ZXing] Scanner start error:', err);
      setError(`Failed to start scanner: ${err.message}`);
      stopAllTracks();
      setIsScanning(false);
    }
  };

  const handleCameraChange = async (newCameraId) => {
    setSelectedCamera(newCameraId);

    if (isScanning) {
      stopScanner();
      setTimeout(async () => {
        try {
          const stream = await getCameraStream(newCameraId);
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            await videoRef.current.play();

            controlsRef.current = await codeReaderRef.current.decodeFromVideoDevice(
              undefined,
              videoRef.current,
              (result, error) => {
                if (result) {
                  setScanResult(result.getText());
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

            setIsScanning(true);
            setTimeout(initializeZoom, 300);
          }
        } catch (err) {
          console.error('[ZXing] Failed to switch camera:', err);
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
    if (currentFacingMode === 'environment') return '(Back Camera)';
    if (currentFacingMode === 'user') return '(Front Camera - Wrong!)';
    return '';
  };

  return (
    <div className="qr-scanner-container">
      <h1>ZXing Scanner</h1>

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
              <option key={camera.deviceId} value={camera.deviceId}>
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

export default ZXingScannerPage;
