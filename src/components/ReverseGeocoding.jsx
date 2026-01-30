import { useState } from 'react'
import './ReverseGeocoding.css'

function ReverseGeocoding() {
  const [latitude, setLatitude] = useState('-6.2088')
  const [longitude, setLongitude] = useState('106.8456')
  const [userAgent, setUserAgent] = useState('Mozilla/5.0 (Linux; Android 8.0.0; SM-G955U Build/R16NW) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Mobile Safari/537.36')
  const [response, setResponse] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [modifiedUA, setModifiedUA] = useState(null)

  const handleReverseGeocode = async () => {
    setLoading(true)
    setError(null)
    setResponse(null)
    setModifiedUA(null)

    try {
      // Call backend proxy instead of Nominatim directly
      const url = `http://localhost:3001/api/reverse-geocode?lat=${latitude}&lon=${longitude}&userAgent=${encodeURIComponent(userAgent)}`

      const res = await fetch(url)

      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`)
      }

      const result = await res.json()

      // Set the user agent info from backend
      setModifiedUA(result.userAgentInfo)

      // Set the geocoding data
      setResponse(result.data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="geocoding-container">
      <h1>Reverse Geocoding</h1>

      <div className="input-section">
        <div className="input-group">
          <label htmlFor="latitude">Latitude</label>
          <input
            id="latitude"
            type="text"
            value={latitude}
            onChange={(e) => setLatitude(e.target.value)}
            placeholder="-6.2088"
          />
        </div>

        <div className="input-group">
          <label htmlFor="longitude">Longitude</label>
          <input
            id="longitude"
            type="text"
            value={longitude}
            onChange={(e) => setLongitude(e.target.value)}
            placeholder="106.8456"
          />
        </div>

        <div className="input-group">
          <label htmlFor="user-agent">User Agent</label>
          <textarea
            id="user-agent"
            value={userAgent}
            onChange={(e) => setUserAgent(e.target.value)}
            placeholder="Enter user agent string..."
            rows={3}
          />
        </div>

        <button
          className="geocode-btn"
          onClick={handleReverseGeocode}
          disabled={loading || !latitude || !longitude || !userAgent}
        >
          {loading ? 'Loading...' : 'Get Location'}
        </button>
      </div>

      {modifiedUA && (
        <div className="ua-info">
          <h3>User Agent Info</h3>
          <div className="ua-detail">
            <strong>Detected:</strong> {modifiedUA.detected}
          </div>
          {modifiedUA.changed ? (
            <>
              <div className="ua-detail changed">
                <strong>Status:</strong> Modified to Android 10.0
              </div>
              <div className="ua-detail">
                <strong>Modified UA:</strong>
                <div className="ua-value">{modifiedUA.modified}</div>
              </div>
            </>
          ) : (
            <div className="ua-detail no-change">
              <strong>Status:</strong> No modification needed
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="error-box">
          <strong>Error:</strong> {error}
        </div>
      )}

      {response && (
        <div className="response-section">
          <h2>Response</h2>
          <div className="response-content">
            <pre>{JSON.stringify(response, null, 2)}</pre>
          </div>
        </div>
      )}
    </div>
  )
}

export default ReverseGeocoding
