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

const sentiAuthClient = require('senti-apicore').sentiAuthClient
const authClient = new sentiAuthClient(process.env.AUTHCLIENTURL, process.env.PASSWORDSALT)
module.exports.authClient = authClient

const sentiAclBackend = require('senti-apicore').sentiAclBackend
const sentiAclClient = require('senti-apicore').sentiAclClient

const aclBackend = new sentiAclBackend(process.env.ACLBACKENDTURL)
const aclClient = new sentiAclClient(aclBackend)
module.exports.aclClient = aclClient


// API endpoint imports
const test = require('./api/index')
const auth = require('./api/auth/auth')
const google = require('./api/auth/google') //Andrei: @Mikkel cake time, you forgot to add this endpoint
const basic = require('./api/auth/basic')
const organisationAuth = require('./api/auth/organisation')
const user = require('./api/entity/user')
const users = require('./api/entity/users')
const organisation = require('./api/entity/organisation')
const organisations = require('./api/entity/organisations')
const roles = require('./api/entity/roles')
const internal = require('./api/entity/internal')
const acltest = require('./api/acl/testResources')

const port = process.env.NODE_PORT || 3024

app.use(helmet())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.use(cors())

//---API---------------------------------------
app.use([test])
app.use([auth, basic, organisationAuth, google])
app.use([user, users, organisation, organisations, roles, internal])
app.use([acltest])

//---Start the express server---------------------------------------------------
var allRoutes = require('./logging/routes')

const startServer = () => {
	allRoutes(app)
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