const express = require('express')
const router = express.Router()
const authClient = require('../../lib/authentication/authClient')
const entityService = require('../../lib/entity/entityService')

const aclClient = require('../../lib/acl/aclClient')
const Privilege = require('../../lib/acl/dataClasses/Privilege')
const ResourceType = require('../../lib/acl/dataClasses/ResourceType')

router.get('/entity/organisations', async (req, res, next) => {
	let lease = await authClient.getLease(req)
	if (lease === false) {
		res.status(401).json()
		return
	}
	let acl = new aclClient()

	let access = await acl.testPrivileges(lease.uuid, "768dd133-26d6-44a6-b992-33bc4cc55b66", [Privilege.organisation.read])
	console.log(access)

	let resources = await acl.findResources(lease.uuid, '00000000-0000-0000-0000-000000000000', ResourceType.org, Privilege.organisation.read)
	let entity = new entityService()
	let queryUUIDs = (resources.length > 0) ? resources.map(item => { return item.uuid }) : false
	res.status(200).json(await entity.getOrganisationsByUUID(queryUUIDs))
})

router.get('/entity/organisations/:uuid', async (req, res, next) => {
	let lease = await authClient.getLease(req)
	if (lease === false) {
		res.status(401).json()
		return
	}
	let acl = new aclClient()
	let entity = new entityService()
	let org = await entity.getDbOrganisationByUUID(req.params.uuid)
	let aclOrg = await entity.getAclOrgResourcesOnName(org.id)
	let resources = await acl.findResources(lease.uuid, aclOrg.aclorg.uuid, ResourceType.org, Privilege.organisation.read)
	let queryUUIDs = (resources.length > 0) ? resources.map(item => { return item.uuid }) : false
	res.status(200).json(await entity.getOrganisationsByUUID(queryUUIDs))
})


/*
	let access = await acl.testPrivileges(lease.uuid, "39541a80-16f4-4968-917c-8acc173e9fa1", [Privilege.organisation.read])
	console.log(access)
	let users = await acl.findResources(lease.uuid, '00000000-0000-0000-0000-000000000000', ResourceType.user, Privilege.user.read)
	console.log(users.map(item => { return item.uuid }))
*/


module.exports = router