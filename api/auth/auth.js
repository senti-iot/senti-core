const express = require('express')
const router = express.Router()
const authService = require('../../lib/authentication/authService')

router.get('/auth', async (req, res, next) => {
	let auth = new authService()
	let lease = await auth.getLease(auth.parseBearerToken(req))
	if (lease !== false) {
		res.status(200).json(lease)
	} else {
		res.status(404).json(lease)
	}
})
router.get('/auth/:token', async (req, res, next) => {
	let auth = new authService()
	let lease = await auth.getLease(req.params.token)
	if (lease !== false) {
		res.status(200).json(lease)
	} else {
		res.status(404).json(lease)
	}
})
router.delete('/auth/:token', async (req, res, next) => {
	let auth = new authService()
	let lease = await auth.getLease(auth.parseBearerToken(req))
	if (lease !== false) {
		res.status(200).json(lease)
	} else {
		res.status(404).json(lease)
	}
})


module.exports = router