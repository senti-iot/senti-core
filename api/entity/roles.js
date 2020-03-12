const express = require('express')
const router = express.Router()
const authClient = require('../../lib/authentication/authClient')
const entityService = require('../../lib/entity/entityService')

const aclClient = require('../../server').aclClient

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

		await aclClient.registerEntity(orgRole.aclUUID)
		await aclClient.addEntityToParent(orgRole.aclUUID, orgEntity.uuid)
		await Object.entries(orgRole.internal.initialPrivileges).reduce(async (promise, [key, privileges]) => {
			console.log(key, privileges)
			let p = await aclClient.addPrivileges(orgRole.aclUUID, aclOrgResources[key].uuid, privileges)
		}, Promise.resolve());

	}, Promise.resolve());
	res.status(200).json(o)
})

router.put('/v2/entity/roles/privileges', async (req, res) => {
	let lease = await authClient.getLease(req)
	if (lease === false) {
		res.status(401).json()
		return
	}
	let result = []
	let entity = new entityService()
	let o = await entity.getDbOrganisationsByUUID([])
	await o.reduce(async (promise, orgEntity) => {
		// This line will wait for the last async function to finish.
		// The first iteration uses an already resolved Promise
		// so, it will immediately continue.
		await promise;
		let aclOrgResources = await entity.getAclOrgResourcesOnName(orgEntity.id)
		let orgRoles = await entity.getAclOrganisationDbRoles(orgEntity.id)
		await Object.entries(orgRoles).reduce(async (promise, [, orgRole]) => {
			await Object.entries(orgRole.internal.initialPrivileges).reduce(async (promise, [key, privileges]) => {
				let p = await aclClient.addPrivileges(orgRole.aclUUID, aclOrgResources[key].uuid, privileges)
				result.push({
					name: orgRole.name,
					aclResource: aclOrgResources[key].uuid,
					privilegeType: key,
					privileges: privileges,
					result: p
				})
			}, Promise.resolve());
		}, Promise.resolve());
	}, Promise.resolve());
	res.status(200).json(result)
})

router.put('/v2/entity/roles/privileges/:key', async (req, res) => {
	let lease = await authClient.getLease(req)
	if (lease === false) {
		res.status(401).json()
		return
	}
	let result = []
	let entity = new entityService()
	let o = await entity.getDbOrganisationsByUUID([])
	await o.reduce(async (promise, orgEntity) => {
		// This line will wait for the last async function to finish.
		// The first iteration uses an already resolved Promise
		// so, it will immediately continue.
		await promise;

		let aclOrgResources = await entity.getAclOrgResourcesOnName(orgEntity.id)
		let orgRoles = await entity.getAclOrganisationDbRoles(orgEntity.id)
		await Object.entries(orgRoles).reduce(async (promise, [, orgRole]) => {
			await Object.entries(orgRole.internal.initialPrivileges).reduce(async (promise, [key, privileges]) => {
				if (key === req.params.key) {
					console.log(orgRole.name, orgRole.uuid, aclOrgResources[key].uuid, key, privileges)
					
					let p = await aclClient.addPrivileges(orgRole.aclUUID, aclOrgResources[key].uuid, privileges)
					result.push({
						name: orgRole.name,
						aclResource: aclOrgResources[key].uuid,
						privilegeType: key,
						privileges: privileges,
						result: p
					})

				}
			}, Promise.resolve());
		}, Promise.resolve());
	}, Promise.resolve());
	res.status(200).json(result)
})
router.put('/v2/entity/role/:uuid/privileges/:key', async (req, res) => {
	let lease = await authClient.getLease(req)
	if (lease === false) {
		res.status(401).json()
		return
	}
	let result = []
	let entity = new entityService()
	let o = await entity.getDbOrganisationsByUUID([])
	await o.reduce(async (promise, orgEntity) => {
		// This line will wait for the last async function to finish.
		// The first iteration uses an already resolved Promise
		// so, it will immediately continue.
		await promise;

		let aclOrgResources = await entity.getAclOrgResourcesOnName(orgEntity.id)
		let orgRole = await entity.getAclOrganisationRoleByUUID(orgEntity.id, req.params.uuid)
		let privileges = orgRole.internal.initialPrivileges[req.params.key]
		let p = await aclClient.addPrivileges(orgRole.aclUUID, aclOrgResources[req.params.key].uuid, privileges)
		result.push({
			name: orgRole.name,
			aclResource: aclOrgResources[req.params.key].uuid,
			privilegeType: req.params.key,
			privileges: privileges,
			result: p
		})
	}, Promise.resolve());
	res.status(200).json(result)
})

module.exports = router