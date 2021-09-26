const express = require('express')
const router = express.Router()
const authService = require('../../lib/authentication/authService')

router.post('/v2/auth/organisation', async (req, res) => {
	let auth = new authService()
	let credentials = {
		orgNickname: req.body.orgNickname,
		username: req.body.username,
		password: req.body.password
	}
	if (credentials.orgNickname && credentials.username && credentials.password) {
		let lease = await auth.orgLogin(credentials.orgNickname, credentials.username, credentials.password)
		if (lease !== false) {
			if (lease.error) {
				return res.status(400).json(lease)
			}
			return res.status(200).json(lease)
		} else {
			return res.status(404).json(lease)
		}
	} else {
		if (!credentials.orgNickname) {
			return res.status(400).json({
				error: "login.missingOrganisation"
			})
		}
		if (!credentials.username) {
			return res.status(400).json({
				error: "login.missingUsername"
			})
		}
		if (!credentials.password) {
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