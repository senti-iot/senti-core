const express = require('express')
const router = express.Router()
const authService = require('../../lib/authentication/authService')

router.post('/v2/auth/organisation', async (req, res) => {
	let auth = new authService()
	if (req.body.orgNickname && req.body.username && req.body.password) {
		let lease = await auth.orgLogin(req.body.orgNickname, req.body.username, req.body.password)    
		if (lease !== false) {
			res.status(200).json(lease)
		} else {
			res.status(404).json(lease)
		}
	} else {
		res.status(400).json()
	}
})
module.exports = router