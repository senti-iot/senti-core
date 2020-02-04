const express = require('express')
const router = express.Router()
const authClient = require('../../lib/authentication/authClient')
const entityService = require('../../lib/entity/entityService')
const RequestUser = require('../../lib/entity/dataClasses/RequestUser')

const uuidv4 = require('uuid/v4');
const sentiToken = require('../../lib/core/sentiToken')

const aclClient = require('../../lib/acl/aclClient')
const Privilege = require('../../lib/acl/dataClasses/Privilege')
const ResourceType = require('../../lib/acl/dataClasses/ResourceType')

router.get('/entity/user/:uuid', async (req, res, next) => {
	let lease = await authClient.getLease(req)
	if (lease === false) {
		res.status(401).json()
		return
	}
	// ACL lease.uuid Privilege.user.read req.params.uuid
	let acl = new aclClient()
	let access = await acl.testPrivileges(lease.uuid, req.params.uuid, [Privilege.user.read])
	if (access.allowed === false) {
		res.status(403).json()
		return
	}
	let entity = new entityService()
	let user = await entity.getUserByUUID(req.params.uuid)

	let dbUser = await entity.getDbUserByUUID(user.uuid)
	let orgAclResources = await entity.getAclOrgResourcesOnName(dbUser.orgId)
	console.log(orgAclResources)

	let priv = await acl.listPrivileges(user.uuid, orgAclResources.aclorg.uuid)
	console.log(priv)

	res.status(200).json(user)
})
router.post('/entity/user', async (req, res, next) => {
	let lease = await authClient.getLease(req)
	if (lease === false) {
		res.status(401).json()
		return
	}
	let acl = new aclClient()
	let entity = new entityService()
	let requestUser = new RequestUser(req.body)
	let parentOrg = (requestUser.org && requestUser.org.uuid) ? await entity.getDbOrganisationByUUID(requestUser.org.uuid) : 0
	if (parentOrg.id === 0) {
		//res.statusMessage = 'Bad request. Parent Organisation failure'
		res.status(400).json()
		return
	}
	requestUser.orgId = parentOrg.id
	// Test MY ACCESS
	let access = await acl.testPrivileges(lease.uuid, parentOrg.uuid, [Privilege.user.create])
	console.log(access)
	if (access.allowed === false) {
		res.status(403).json()
		return
	}
	// Check på brugernavn og mail om disse findes
	let existingUser = await entity.getUserByUserName(requestUser.userName)
	if (existingUser !== false) {
		res.statusMessage = 'User exist'
		res.status(409).json()
		return
	}
	
	let requestUserRole = await entity.getAclOrganisationRoleByUUID(requestUser.orgId, requestUser.role.uuid)
	console.log(requestUserRole)
	// TEST ROLE ACCESS
	let leaseUser = await entity.getUserByUUID(lease.uuid)
	if (requestUserRole.priority < leaseUser.role.priority) {
		res.status(403).json()
		return
	}
	requestUser.roleId = requestUserRole.roleId

	let orgAclResources = await entity.getAclOrgResourcesOnName(requestUser.orgId)

	let user = await entity.createUser(requestUser)
	await acl.registerEntity(user.uuid)
	await acl.addEntityToParent(user.uuid, requestUserRole.aclUUID)

	await acl.registerResource(user.uuid, ResourceType.user)
	await acl.addResourceToParent(user.uuid, orgAclResources.users.uuid)

	// LOOP GROUPS AND ADD USER TO RESOURCE GROUPS -- and maybe later also entity groups(for special privileges)

	// Check state if i should create token and send mail
	switch (user.state) {
		case entityService.userState.confirm:
			break;
		case entityService.userState.approve:
			break;
	}
	res.status(200).json(user)
})
router.put('/entity/user/:uuid', async (req, res, next) => {
	let lease = await authClient.getLease(req)
	if (lease === false) {
		res.status(401).json()
		return
	}
	let entity = new entityService()
	let requestUser = new RequestUser(req.body)
	let requestOrg = await entity.getDbOrganisationByUUID(requestUser.org.uuid)
	if (requestOrg.id === 0) {
		//res.statusMessage = 'Bad request. Parent Organisation failure'
		res.status(400).json()
		return
	}
	requestUser.orgId = requestOrg.id
	// Test MY ACCESS
	let acl = new aclClient()
	let access = await acl.testPrivileges(lease.uuid, requestOrg.uuid, [Privilege.user.modify])
	console.log(access)
	if (access.allowed === false) {
		res.status(403).json()
		return
	}
	let user = await entity.getDbUserByUUID(req.params.uuid)
	console.log(user)

	let requestUserRole = await entity.getAclOrganisationRoleByUUID(requestUser.orgId, requestUser.role.uuid)
	requestUser.roleId = requestUserRole.roleId
	let userRole = await entity.getAclOrganisationRole(user.orgId, user.roleId)

	// TEST ROLE ACCESS
	let leaseUser = await entity.getUserByUUID(lease.uuid)
	if (requestUserRole.priority < leaseUser.role.priority) {
		res.status(403).json()
		return
	}

	// Check for ORG Changes
	if (user.orgId !== requestUser.orgId) {
		console.log('Must change parent org')
		let changeParentAccess = await acl.testPrivileges(lease.uuid, requestOrg.uuid, [Privilege.user.create])
		if (changeParentAccess.allowed === false) {
			res.status(403).json()
			return
		}
		await acl.removeEntityFromParent(user.uuid, userRole.aclUUID)
		await acl.addEntityToParent(user.uuid, requestUserRole.aclUUID)

		let orgAclResources = await entity.getAclOrgResourcesOnName(user.orgId)
		let requestOrgAclResources = await entity.getAclOrgResourcesOnName(requestUser.orgId)

		await acl.removeResourceFromParent(user.uuid, orgAclResources.users.uuid)
		await acl.addResourceToParent(user.uuid, requestOrgAclResources.users.uuid)
	}
	
	// Check for ROLE Changes
	if (requestUser.roleId !== user.roleId) {
		await acl.removeEntityFromParent(user.uuid, userRole.aclUUID)
		await acl.addEntityToParent(user.uuid, requestUserRole.aclUUID)
	}

	// LOOP GROUPS AND ADD USER TO RESOURCE GROUPS -- and maybe later also entity groups(for special privileges)

	// Assign changed data and update user
	user.assignDiff(requestUser)
	await entity.updateUser(user)
	res.status(200).json(await entity.getUserById(user.id))
})
router.delete('/entity/user/:uuid', async (req, res, next) => {
	// ACL lease.uuid DELETE user req.params.uuid IN org req.body.org.uuid
})




router.get('/entity/user/init', async (req, res, next) => {
	let lease = await authClient.getLease(req)
	if (lease === false) {
		res.status(401).json()
		return
	}

	let hack = 'ee53c864-d226-46da-ba8a-e28825940189'

	let entity = new entityService()
	let user = await entity.getUserByUUID(hack)
	let acl = new aclClient()

	/* let org = await entity.getDbOrganisationByUUID(req.params.uuid)
	let orgAclResources = await entity.getAclOrgResourceGroupsOnName(org.id) */
	await acl.registerResource(user.uuid, ResourceType.user)
	await acl.addResourceToParent(user.uuid, user.org.uuid)


	let access = await acl.testPrivileges(lease.uuid, user.uuid, [Privilege.user.read])
	console.log(access)
	if (access.allowed === false) {
		res.status(403).json()
		return
	}


	res.status(200).json(user)


})
module.exports = router