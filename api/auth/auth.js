const express = require('express')
const router = express.Router()

const authService = require('../../lib/authentication/authService')

const { sentiAclPriviledge, sentiAclResourceType } = require('senti-apicore')
const aclClient = require('../../server').aclClient

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
	let internalUser = await entity.getInternalUserByUUID(lease.uuid)
	let aclResources = await entity.getAclOrgResourcesOnName(await entity.getOrganisationIdByUUID(internalUser.org.uuid))
	let userPrivileges = await aclClient.listPrivileges(lease.uuid, aclResources['appui'].uuid, true) 
	internalUser.privileges = userPrivileges.privileges.map(item => {
	 	return item.privilege
	})
	res.status(200).json(internalUser)
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