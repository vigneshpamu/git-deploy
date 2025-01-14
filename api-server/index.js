require('dotenv').config() // Import dotenv for environment variables
const express = require('express')
const { generateSlug } = require('random-word-slugs')
const { ECSClient, RunTaskCommand } = require('@aws-sdk/client-ecs')
const { Server } = require('socket.io')
const Redis = require('ioredis')
const cors = require('cors')

const app = express()
const PORT = process.env.PORT || 9000

app.use(cors())

const subscriber = new Redis(process.env.REDIS_URL)

const io = new Server({ cors: '*' })

io.on('connection', (socket) => {
  socket.on('subscribe', (channel) => {
    socket.join(channel)
    console.log('Subscribed to:', channel)
    socket.emit('message', `Joined ${channel}`)
  })
})

io.listen(process.env.SOCKET_PORT || 9002, () =>
  console.log(`Socket Server ${process.env.SOCKET_PORT || 9002}`)
)

const ecsClient = new ECSClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
})

const config = {
  CLUSTER: process.env.ECS_CLUSTER,
  TASK: process.env.ECS_TASK,
}

app.use(express.json())

app.post('/project', async (req, res) => {
  const { gitURL, slug } = req.body

  console.log('gitURL: ', gitURL)

  if (!gitURL) {
    return res.status(400).json({ error: 'gitURL is required' })
  }

  function convertGitHubUrlToProjName(url) {
    const regex = /https:\/\/github\.com\/([^\/]+)\/([^\/]+)/
    const match = url.match(regex)

    if (match) {
      const username = match[1]
      const repoName = match[2].replace(/-/g, '-') // Keep dashes as is
      return `${username}-proj-${repoName}`
    }
    return null // Return null if the URL doesn't match
  }

  const projectSlug = slug ? slug : convertGitHubUrlToProjName(gitURL)

  // Spin the container
  const command = new RunTaskCommand({
    cluster: config.CLUSTER,
    taskDefinition: config.TASK,
    launchType: 'FARGATE',
    count: 1,
    networkConfiguration: {
      awsvpcConfiguration: {
        assignPublicIp: 'ENABLED',
        subnets: process.env.AWS_SUBNETS.split(','), // Subnets as an array
        securityGroups: [process.env.AWS_SECURITY_GROUP],
      },
    },
    overrides: {
      containerOverrides: [
        {
          name: process.env.CONTAINER_NAME,
          environment: [
            { name: 'GIT_REPOSITORY_URL', value: gitURL },
            { name: 'PROJECT_ID', value: projectSlug },
          ],
        },
      ],
    },
  })

  await ecsClient.send(command)

  return res.json({
    status: 'queued',
    data: {
      projectSlug,
      url: `http://${projectSlug}.localhost:${
        process.env.PROJECT_PORT || 8000
      }`,
    },
  })
})

async function initRedisSubscribe() {
  console.log('Subscribed to logs....')
  subscriber.psubscribe('logs:*')
  subscriber.on('pmessage', (pattern, channel, message) => {
    console.log(message)
    io.to(channel).emit('message', message)
  })
}

initRedisSubscribe()

app.listen(PORT, () => console.log(`API Server Running on port ${PORT}`))
