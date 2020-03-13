const express = require('express')
const router = express.Router()
const authClient = require('../../server').authClient
const entityService = require('../../lib/entity/entityService')

const RequestOrganisation = require('../../lib/entity/dataClasses/RequestOrganisation')

const aclClient = require('../../server').aclClient
const Privilege = require('../../lib/acl/dataClasses/Privilege')
const ResourceType = require('../../lib/acl/dataClasses/ResourceType')

router.get('/v2/entity/organisation/:uuid', async (req, res) => {
	let lease = await authClient.getLease(req)
	if (lease === false) {
		res.status(401).json()
		return
	}
	// ACL lease.uuid Privilege.organisation.read user req.params.uuid
	let access = await aclClient.testPrivileges(lease.uuid, req.params.uuid, [Privilege.organisation.read])
	if (access.allowed === false) {
		res.status(403).json()
		return
	}
	let entity = new entityService()
	let organisation = await entity.getOrganisationByUUID(req.params.uuid)
	res.status(200).json(organisation)
})
router.post('/v2/entity/organisation', async (req, res) => {
	let lease = await authClient.getLease(req)
	if (lease === false) {
		res.status(401).json()
		return
	}
	let entity = new entityService()
	let requestOrg = new RequestOrganisation(req.body)
	let parentOrg = (requestOrg.org && requestOrg.org.uuid) ? await entity.getDbOrganisationByUUID(requestOrg.org.uuid) : await entity.getDbOrganisationById(1)
	if (parentOrg.id === 0) {
		//res.statusMessage = 'Bad request. Parent Organisation failure'
		res.status(400).json()
		return
	}
	requestOrg.parentOrgId = parentOrg.id
	// Test MY ACCESS
	let access = await aclClient.testPrivileges(lease.uuid, parentOrg.uuid, [Privilege.organisation.create])
	if (access.allowed === false) {
		res.status(403).json()
		return
	}
	requestOrg.uuname = entity.getUUName(requestOrg.name)
	requestOrg.nickname = entity.getNickname(requestOrg.name)
	let org = await entity.createOrganisation(requestOrg)
	let parentAclResources = await entity.getAclOrgResourcesOnName(parentOrg.id)
	let aclOrgResources = await entity.createAclOrgResources(org)
	// Register ACL ORG as resource
	let aclOrgResource = await aclClient.registerResource(aclOrgResources['aclorg'].uuid, ResourceType.aclorg)
	await aclClient.addResourceToParent(aclOrgResource.uuid, parentAclResources['aclorg'].uuid)

	// Register org as entity
	let orgEntity = await aclClient.registerEntity(org.uuid)
	// Register org as resource under ACL ORG
	let orgResource = await aclClient.registerResource(org.uuid, ResourceType.org)
	if (orgEntity.uuid !== orgResource.uuid) {
		console.log('Something went really wrong...')
		res.status(400).json()
		return
	}
	await aclClient.addResourceToParent(orgResource.uuid, aclOrgResource.uuid)
	// Register aclOrgResources and add them to ORG
	await Promise.all(Object.entries(aclOrgResources).map(async ([, aclResource]) => {
		if (aclResource.type !== 1 && aclResource.type !== 3) {
			await aclClient.registerResource(aclResource.uuid, aclResource.type)
			await aclClient.addResourceToParent(aclResource.uuid, orgResource.uuid)
		}
	}))
	// Get organisation roles
	let orgRoles = await entity.createAclOrganisationRoles(org.id)
	await Promise.all(orgRoles.map(async (orgRole) => {
		// Register role as entity under org
		await aclClient.registerEntity(orgRole.aclUUID)
		await aclClient.addEntityToParent(orgRole.aclUUID, orgEntity.uuid)
		// Add initial privileges for role on org->aclResources
		await Promise.all(Object.entries(orgRole.internal.initialPrivileges).map(async ([key, privileges]) => {
			let p = await aclClient.addPrivileges(orgRole.aclUUID, aclOrgResources[key].uuid, privileges)
			//console.log(orgRole.uuid, aclOrgResources[key].uuid, privileges, p)
		}))
	}))
	let resultOrg = await entity.getOrganisationById(org.id)
	res.status(200).json(resultOrg)
})
router.put('/v2/entity/organisation/:uuid', async (req, res) => {
	let lease = await authClient.getLease(req)
	if (lease === false) {
		res.status(401).json()
		return
	}
	let entity = new entityService()
	let requestOrg = new RequestOrganisation(req.body)
	// Test MY ACCESS
	let access = await aclClient.testPrivileges(lease.uuid, req.params.uuid, [Privilege.organisation.modify])
	if (access.allowed === false) {
		res.status(403).json()
		return
	}
		
	let org = await entity.getDbOrganisationByUUID(req.params.uuid)
	let requestParentOrg = await entity.getDbOrganisationByUUID(requestOrg.org.uuid)
	if (requestParentOrg.id === 0) {
		//res.statusMessage = 'Bad request. Parent Organisation failure'
		res.status(400).json()
		return
	}
	requestOrg.parentOrgId = requestParentOrg.id

	if (org.parentOrgId !== requestOrg.parentOrgId) {
		console.log('Must change parent org')
		let changeParentAccess = await aclClient.testPrivileges(lease.uuid, requestParentOrg.uuid, [Privilege.organisation.create])
		if (changeParentAccess.allowed === false) {
			res.status(403).json()
			return
		}
		let requestParentAclResources = await entity.getAclOrgResourcesOnName(requestParentOrg.id)
		let parentAclResources = await entity.getAclOrgResourcesOnName(org.parentOrgId)
		let orgAclResources = await entity.getAclOrgResourcesOnName(org.id)

		await aclClient.removeResourceFromParent(orgAclResources['aclorg'].uuid, parentAclResources['aclorg'].uuid)
		await aclClient.addResourceToParent(orgAclResources['aclorg'].uuid, requestParentAclResources['aclorg'].uuid)
	}
	org.assignDiff(requestOrg);
	let updatedOrg = await entity.updateOrganisation(org)
	let resultOrg = await entity.getOrganisationById(updatedOrg.id)
	res.status(200).json(resultOrg)
})
router.delete('/v2/entity/organisation/:uuid', async (req, res) => {
	let lease = await authClient.getLease(req)
	if (lease === false) {
		res.status(401).json()
		return
	}
	let access = await aclClient.testPrivileges(lease.uuid, req.params.uuid, [Privilege.organisation.delete])
	if (access.allowed === false) {
		res.status(403).json()
		return
	}
	let entity = new entityService()
	let org = await entity.getDbOrganisationByUUID(req.params.uuid)
	//let deletedOrg = await entity.deleteOrganisation(org)
	res.status(200).json()
})
router.get('/v2/entity/organisation/:uuid/resourcegroups', async (req, res) => {
	let lease = await authClient.getLease(req)
	if (lease === false) {
		res.status(401).json()
		return
	}
	let access = await aclClient.testPrivileges(lease.uuid, req.params.uuid, [Privilege.organisation.read])
	if (access.allowed === false) {
		res.status(403).json()
		return
	}
	let entity = new entityService()

	let org = await entity.getDbOrganisationByUUID(req.params.uuid)
	let orgAclResources = await entity.getAclOrgResourcesOnName(org.id)
	res.status(200).json(orgAclResources)
})
module.exports = router