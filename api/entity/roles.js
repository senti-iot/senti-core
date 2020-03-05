const express = require('express')
const router = express.Router()
const authClient = require('../../lib/authentication/authClient')
const entityService = require('../../lib/entity/entityService')

const aclClient = require('../../lib/acl/aclClient')

router.get('/v2/entity/roles', async (req, res) => {
	let lease = await authClient.getLease(req)
	if (lease === false) {
		res.status(401).json()
		return
	}
	let entity = new entityService()
	res.status(200).json(await entity.getRoles())
})
router.get('/v2/entity/role/:uuid/init', async (req, res) => {
	let lease = await authClient.getLease(req)
	if (lease === false) {
		res.status(401).json()
		return
	}
	let entity = new entityService()
	let acl = new aclClient()
	let o = await entity.getDbOrganisationsByUUID([])
	await o.reduce(async (promise, orgEntity) => {
		// This line will wait for the last async function to finish.
		// The first iteration uses an already resolved Promise
		// so, it will immediately continue.
		await promise;
		
		await entity.dbSaveAclOrganisationRole(orgEntity.id, 5)

		let aclOrgResources = await entity.getAclOrgResourcesOnName(orgEntity.id)
		let orgRole = await entity.getAclOrganisationRole(orgEntity.id, 5)

		console.log(orgEntity.uuid, orgRole)

		await acl.registerEntity(orgRole.aclUUID)
		await acl.addEntityToParent(orgRole.aclUUID, orgEntity.uuid)
		await Object.entries(orgRole.internal.initialPrivileges).reduce(async (promise, [key, privileges]) => {
			console.log(key, privileges)
			let p = await acl.addPrivileges(orgRole.aclUUID, aclOrgResources[key].uuid, privileges)
		}, Promise.resolve());

	}, Promise.resolve());
	res.status(200).json(o)
})
module.exports = router