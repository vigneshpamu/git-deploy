const { exec } = require('child_process')
const path = require('path')
const fs = require('fs')
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3')
const mime = require('mime-types')
const Redis = require('ioredis')

// Redis connection
const publisher = new Redis(process.env.REDIS_URL)

const s3Client = new S3Client({
  region: process.env.AWS_REGION, // AWS region
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID, // AWS access key ID
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY, // AWS secret access key
  },
})

const PROJECT_ID = process.env.PROJECT_ID

function publishLog(log) {
  publisher.publish(`logs:${PROJECT_ID}`, JSON.stringify({ log }))
}

async function init() {
  console.log('Executing script.js')
  publishLog('Build Started...')
  const outDirPath = path.join(__dirname, 'output')

  const p = exec(`cd ${outDirPath} && npm install && npm run build`)

  p.stdout.on('data', function (data) {
    console.log(data.toString())
    publishLog(data.toString())
  })

  p.stdout.on('error', function (data) {
    console.log('Error', data.toString())
    publishLog(`error: ${data.toString()}`)
  })

  p.on('close', async function (data) {
    console.log('Build Complete')
    publishLog(`Build Complete`)
    const distFolderPath = path.join(__dirname, 'output', 'dist')
    const distFolderContents = fs.readdirSync(distFolderPath, {
      recursive: true,
    })

    publishLog(`Starting to upload`)

    for (const file of distFolderContents) {
      const filePath = path.join(distFolderPath, file)
      if (fs.lstatSync(filePath).isDirectory()) continue

      console.log('Uploading', filePath)
      publishLog(`uploading ${file}`)

      const command = new PutObjectCommand({
        Bucket: process.env.AWS_BUCKET_NAME, // S3 bucket name
        Key: `__outputs/${PROJECT_ID}/${file}`,
        Body: fs.createReadStream(filePath),
        ContentType: mime.lookup(filePath),
      })

      await s3Client.send(command)
      publishLog(`uploaded ${file}`)
      console.log('Uploaded', filePath)
    }
    publishLog(`Done`)
    console.log('Done..')
  })
}

init()
// sd
