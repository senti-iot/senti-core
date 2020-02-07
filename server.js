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
const test = require('./api/index')
const auth = require('./api/auth/auth')
const basic = require('./api/auth/basic')
const organisationAuth = require('./api/auth/organisation')
const user = require('./api/entity/user')
const users = require('./api/entity/users')
const organisation = require('./api/entity/organisation')
const organisations = require('./api/entity/organisations')
const roles = require('./api/entity/roles')
const internal = require('./api/entity/internal')

const port = process.env.NODE_PORT || 3024

app.use(helmet())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.use(cors())

//---API---------------------------------------
app.use([test])
app.use([auth, basic, organisationAuth])
app.use([user, users, organisation, organisations, roles, internal])

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