const express = require('express')
const crypto = require('crypto')
const axios = require('axios') // Import axios

const app = express()
app.use(express.json()) // To parse incoming JSON payloads

const WEBHOOK_SECRET = 'secret' // Shared secret for securing webhooks

// Utility function to verify GitHub's signature
function verifySignature(req) {
  const payload = JSON.stringify(req.body)
  const sig = req.headers['x-hub-signature']
  if (!sig) {
    return false
  }

  const hmac = crypto.createHmac('sha1', WEBHOOK_SECRET)
  const digest = `sha1=${hmac.update(payload).digest('hex')}`

  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(digest))
}

app.use((req, res, next) => {
  req.headers['ngrok-skip-browser-warning'] = '' // Set the header to an empty string
  next() // Call the next middleware
})

// Webhook listener
app.post('/webhook', async (req, res) => {
  // Verify that the request is from GitHub
  if (!verifySignature(req)) {
    return res.status(401).send('Invalid signature')
  }

  const event = req.headers['x-github-event'] // Get the type of GitHub event

  // We're only interested in push events
  if (event === 'push') {
    const repoFullName = req.body.repository.full_name // e.g., "username/repo"
    const ref = req.body.ref // The branch that was pushed to (e.g., "refs/heads/main")

    // If the push was to the main branch, trigger the redeployment
    if (ref === 'refs/heads/main') {
      console.log(
        `Received push event for repo: ${repoFullName}. Starting redeployment.`
      )

      console.log('Body Data', req.body)

      // Trigger redeployment
      try {
        // Make a POST request to the specified endpoint on port 9000
        const response = await axios.post('http://localhost:9000/project', {
          gitURL: req.body.repository.html_url,
        })

        console.log('Deployment response:', response.data)
      } catch (error) {
        console.error('Error making POST request:', error)
      }
      //   deployProject(repoFullName)
    }
  }

  res.status(200).send('Webhook received')
})

// Function to handle redeployment

// Start the server
const PORT = process.env.PORT || 3003
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`)
})
