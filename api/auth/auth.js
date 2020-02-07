const express = require('express')
const router = express.Router()

const authService = require('../../lib/authentication/authService')
const entityService = require('../../lib/entity/entityService')

router.get('/auth', async (req, res) => {
	let auth = new authService()
	let lease = await auth.getLease(auth.parseBearerToken(req))
	if (lease !== false) {
		res.status(200).json(lease)
	} else {
		res.status(404).json(lease)
	}
})
router.get('/auth/user', async (req, res) => {
	let auth = new authService()
	let lease = await auth.getLease(auth.parseBearerToken(req))
	if (lease === false) {
		res.status(401).json()
		return
	}
	let entity = new entityService()
	/*	
	let dbUser = await entity.getDbUserByUUID(user.uuid)
	let orgAclResources = await entity.getAclOrgResourcesOnName(dbUser.orgId)
	console.log(orgAclResources)

	let priv = await acl.listPrivileges(user.uuid, orgAclResources.aclorg.uuid)
	console.log(priv)
	*/
	res.status(200).json(await entity.getInternalUserByUUID(lease.uuid))
})
router.get('/auth/:token', async (req, res) => {
	let auth = new authService()
	let lease = await auth.getLease(req.params.token)
	if (lease !== false) {
		res.status(200).json(lease)
	} else {
		res.status(404).json(lease)
	}
})
router.delete('/auth/:token', async (req, res) => {
	let auth = new authService()
	let lease = await auth.getLease(auth.parseBearerToken(req))
	if (lease !== false) {
		res.status(200).json(await auth.expireLease(lease.token))
	} else {
		res.status(404).json(lease)
	}
})
module.exports = router