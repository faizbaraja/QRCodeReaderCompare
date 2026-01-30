import express from 'express'
import cors from 'cors'
import fetch from 'node-fetch'

const app = express()
const PORT = 3001

app.use(cors())
app.use(express.json())

// Function to modify user agent - replace Android < 10 with Android 10
function modifyUserAgent(ua) {
  const androidRegex = /Android\s+(\d+)(?:\.(\d+))?(?:\.(\d+))?/i
  const match = ua.match(androidRegex)

  if (match) {
    const majorVersion = parseInt(match[1])

    if (majorVersion < 10) {
      const modified = ua.replace(androidRegex, 'Android 10.0')
      return {
        modified,
        original: ua,
        detected: `Android ${majorVersion}`,
        changed: true
      }
    } else {
      return {
        modified: ua,
        original: ua,
        detected: `Android ${majorVersion}`,
        changed: false
      }
    }
  }

  return {
    modified: ua,
    original: ua,
    detected: 'No Android version found',
    changed: false
  }
}

// Reverse geocoding endpoint
app.get('/api/reverse-geocode', async (req, res) => {
  try {
    const { lat, lon, userAgent } = req.query

    if (!lat || !lon) {
      return res.status(400).json({ error: 'Latitude and longitude are required' })
    }

    // Use provided user agent or default
    const originalUA = userAgent || 'Mozilla/5.0 (Linux; Android 8.0.0; SM-G955U Build/R16NW) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Mobile Safari/537.36'

    // Modify user agent
    const uaInfo = modifyUserAgent(originalUA)

    // Make request to Nominatim with modified user agent
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&zoom=18&polygon_geojson=1&format=jsonv2`

    const response = await fetch(url, {
      headers: {
        'User-Agent': uaInfo.modified
      }
    })

    if (!response.ok) {
      throw new Error(`Nominatim API error: ${response.status}`)
    }

    const data = await response.json()

    // Return both the geocoding data and user agent info
    res.json({
      data,
      userAgentInfo: uaInfo
    })
  } catch (error) {
    console.error('Error:', error)
    res.status(500).json({ error: error.message })
  }
})

app.listen(PORT, () => {
  console.log(`Proxy server running on http://localhost:${PORT}`)
})
