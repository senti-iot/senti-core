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

const port = process.env.NODE_PORT || 3024

app.use(helmet())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.use(cors())

//---API---------------------------------------
app.use([test])
app.use([auth, basic, organisationAuth])
app.use([user, users, organisation, organisations, roles])


/* const crypto = require('crypto');
const secret = 'mikkel';
const hash = crypto.createHash('sha256').update(process.env.PASSWORDSALT + crypto.createHash('md5').update(secret).digest('hex')).digest('hex')
console.log(hash);
 */
/* const uuidv4 = require('uuid/v4');
for (let index = 0; index < 10; index++) {
	console.log(uuidv4())	
}
console.log(uuidv4())
 */
/* const ResourceType = require('./lib/acl/dataClasses/ResourceType')
let aOrgResources = [1, 2, 3, 5, 7, 8, 14]
Object.entries(ResourceType).map(async ([key, type]) => {
	//let bOrgResource = (type)
	console.log(key, aOrgResources.includes(type))
}) */


/* let approvedKeys = ["years", "y", "quarters", "Q", "months", "M", "weeks", "w", "days", "d", "hours", "h", "minutes", "m", "seconds", "s", "milliseconds", "ms"]
approvedKeys.filter(item => { return item === '' })
console.log((approvedKeys.filter(item => { return item === 'months' })[0] !== undefined) ? true : false)
console.log(Object.keys({ days: 30 })[0])

const sentiToken = require('./lib/core/sentiToken')
let tokenService = new sentiToken()
tokenService.createUserToken(1)
 */

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