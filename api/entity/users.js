const express = require('express')
const router = express.Router()
const authClient = require('../../server').authClient
const entityService = require('../../lib/entity/entityService')

const aclClient = require('../../server').aclClient
const Privilege = require('../../lib/acl/dataClasses/Privilege')
const ResourceType = require('../../lib/acl/dataClasses/ResourceType')

/**
 * Get all users the lease has access to.
 */
router.get('/v2/entity/users', async (req, res) => {
	let lease = await authClient.getLease(req)
	if (lease === false) {
		res.status(401).json()
		return
	}
	let resources = await aclClient.findResources(lease.uuid, '00000000-0000-0000-0000-000000000000', ResourceType.user, Privilege.user.read)

	let entity = new entityService()
	let queryUUIDs = (resources.length > 0) ? resources.map(item => { return item.uuid }) : false
	res.status(200).json(await entity.getUsersByUUID(queryUUIDs))
})
/**
 * Get all users in :orguuid ord, that lease user has access to.
 * @routeparam {String} :orguuid
 */
router.get('/v2/entity/users/:orguuid', async (req, res) => {
	let lease = await authClient.getLease(req)
	if (lease === false) {
		res.status(401).json()
		return
	}
	let entity = new entityService()
	// Add if we want recursive under ACL ORG
	// let org = await entity.getDbOrganisationByUUID(req.params.uuid)
	// let aclOrg = await entity.getAclOrgResourcesOnName(org.id)
	let resources = await aclClient.findResources(lease.uuid, req.params.orguuid, ResourceType.user, Privilege.user.read) // aclOrg.aclorg.uuid
	let queryUUIDs = (resources.length > 0) ? resources.map(item => { return item.uuid }) : false
	res.status(200).json(await entity.getUsersByUUID(queryUUIDs))
})

/** Waterworks Installations<->Users connection
 * @param {Array<UUIDS>} uuids - User uuids
*/

router.post('/v2/entity/waterworks/users/', async (req, res) => {
	let lease = await authClient.getLease(req)
	if (lease === false) {
		res.status(401).json()
		return
	}
	let entity = new entityService()
	let uuids = req.body.uuids
	let users = await entity.getUsersByUUID(uuids)
	return res.status(200).json(users)
})

module.exports = router