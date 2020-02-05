const express = require('express')
const router = express.Router()
const authService = require('../../lib/authentication/authService')

router.post('/auth/basic', async (req, res) => {
	let auth = new authService()
	let credentials = auth.parseBasicToken(req)
	if (credentials === null) {
		credentials = {
			"username": req.body.username ? req.body.username : false,
			"password": req.body.password ? req.body.password : false
		}
	}
	if (credentials.username !== false && credentials.password !== false) {
		let lease = await auth.login(credentials.username, credentials.password)    
		if (lease !== false) {
			res.status(200).json(lease)
		} else {
			res.status(404).json(lease)
		}
	} else {
		res.status(400).json('')
	}
})
module.exports = router