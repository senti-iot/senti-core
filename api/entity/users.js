const express = require('express')
const router = express.Router()
const authClient = require('../../server').authClient
const entityService = require('../../lib/entity/entityService')

const aclClient = require('../../server').aclClient
const Privilege = require('../../lib/acl/dataClasses/Privilege')
const ResourceType = require('../../lib/acl/dataClasses/ResourceType')

router.get('/v2/entity/users', async (req, res) => {
	let lease = await authClient.getLease(req)
	if (lease === false) {
		res.status(401).json()
		return
	}
	let resources = await aclClient.findResources(lease.uuid, '00000000-0000-0000-0000-000000000000', ResourceType.user, Privilege.user.read)
	let entity = new entityService()
	let queryUUIDs = (resources.length > 0) ? resources.map(item => { return item.uuid }) : false
	console
	res.status(200).json(await entity.getUsersByUUID(queryUUIDs))
})

router.get('/v2/entity/users/:uuid', async (req, res) => {
	let lease = await authClient.getLease(req)
	if (lease === false) {
		res.status(401).json()
		return
	}
	let entity = new entityService()
	let org = await entity.getDbOrganisationByUUID(req.params.uuid)
	let aclOrg = await entity.getAclOrgResourcesOnName(org.id)
	let resources = await aclClient.findResources(lease.uuid, aclOrg.aclorg.uuid, ResourceType.user, Privilege.user.read)
	let queryUUIDs = (resources.length > 0) ? resources.map(item => { return item.uuid }) : false
	res.status(200).json(await entity.getUsersByUUID(queryUUIDs))
})
module.exports = router