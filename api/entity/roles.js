const express = require('express')
const router = express.Router()
const authClient = require('../../lib/authentication/authClient')
const entityService = require('../../lib/entity/entityService')

const aclClient = require('../../lib/acl/aclClient')

router.get('/entity/roles', async (req, res, next) => {
	let lease = await authClient.getLease(req)
	if (lease === false) {
		res.status(401).json()
		return
	}
	let entity = new entityService()
	res.status(200).json(await entity.getRoles())
})
module.exports = router