const express = require('express')
const router = express.Router()

const authService = require('../../lib/authentication/authService')
const entityService = require('../../lib/entity/entityService')

router.get('/v2/auth', async (req, res) => {
	let auth = new authService()
	let lease = await auth.getLease(auth.parseBearerToken(req))
	if (lease !== false) {
		res.status(200).json(lease)
	} else {
		res.status(404).json(lease)
	}
})
router.get('/v2/auth/user', async (req, res) => {
	let auth = new authService()
	let lease = await auth.getLease(auth.parseBearerToken(req))
	if (lease === false) {
		res.status(401).json()
		return
	}
	let entity = new entityService()
	res.status(200).json(await entity.getInternalUserByUUID(lease.uuid))
})
router.get('/v2/auth/:token', async (req, res) => {
	let auth = new authService()
	let lease = await auth.getLease(req.params.token)
	if (lease !== false) {
		res.status(200).json(lease)
	} else {
		res.status(404).json(lease)
	}
})
router.delete('/v2/auth/:token', async (req, res) => {
	let auth = new authService()
	let lease = await auth.getLease(auth.parseBearerToken(req))
	if (lease !== false) {
		res.status(200).json(await auth.expireLease(lease.token))
	} else {
		res.status(404).json(lease)
	}
})
module.exports = router