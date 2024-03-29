const express = require('express')
const router = express.Router()
const authService = require('../../lib/authentication/authService')

router.post('/v2/auth/basic', async (req, res) => {
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
			if (lease.error) {
				return res.status(400).json(lease)
			}
			return res.status(200).json(lease)
		} else {
			return res.status(404).json(lease)
		}
	} else {
		if (credentials.username === false) {
			return res.status(400).json({
				error: "login.missingUsername"
			})
		}
		if (credentials.password === false) {
			return res.status(400).json({
				error: "login.missingPassword"
			})
		}
		res.status(500).json({
			error: "login.unknownError"
		})
	}
})
module.exports = router