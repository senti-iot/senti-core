#!/usr/bin/env nodejs
process.title = "senti_core"
const dotenv = require('dotenv').config()
if (dotenv.error) {
	console.warn(dotenv.error)
}
const express = require('express')
const cors = require('cors')
const helmet = require('helmet')
const app = express()

// API endpoint imports

const port = process.env.NODE_PORT || 3007

app.use(helmet())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.use(cors())


//---Start the express server---------------------------------------------------

const startServer = () => {
	app.listen(port, () => {
		console.log('Senti Core Service started on port', port)
	}).on('error', (err) => {
		if (err.errno === 'EADDRINUSE') {
			console.log('Service not started, port ' + port + ' is busy')
		} else {
			console.log(err)
		}
	})
}

startServer()
