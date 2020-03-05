const express = require('express')
const router = express.Router()

const mysqlConn = require('../../mysql/mysql_handler')

const authClient = require('../../lib/authentication/authClient')
const entityService = require('../../lib/entity/entityService')

const sentiToken = require('senti-apicore').sentiToken
const sentiMail = require('senti-apicore').sentiMail

const RequestUser = require('../../lib/entity/dataClasses/RequestUser')
const RequestCredentials = require('../../lib/entity/dataClasses/RequestCredentials')

const aclClient = require('../../lib/acl/aclClient')
const Privilege = require('../../lib/acl/dataClasses/Privilege')
const ResourceType = require('../../lib/acl/dataClasses/ResourceType')

router.get('/v2/entity/user/:uuid', async (req, res) => {
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
	res.status(200).json(user)
})
router.post('/v2/entity/user', async (req, res) => {
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

	let dbUser = await entity.createUser(requestUser)
	await acl.registerEntity(dbUser.uuid)
	await acl.addEntityToParent(dbUser.uuid, requestUserRole.aclUUID)

	await acl.registerResource(dbUser.uuid, ResourceType.user)
	await acl.addResourceToParent(dbUser.uuid, orgAclResources.users.uuid)

	// LOOP GROUPS AND ADD USER TO RESOURCE GROUPS -- and maybe later also entity groups(for special privileges)

	// Check state if i should create token and send mail

	let mailService = new sentiMail(process.env.SENDGRID_API_KEY, mysqlConn)
	let tokenService = new sentiToken(mysqlConn)
	let token
	let msg

	switch (dbUser.state) {
		case entityService.userState.confirm:
			token = await tokenService.createUserToken(dbUser.id, sentiToken.confirmUser, { days: 7 })
			msg = await mailService.getMailMessageFromTemplateType(sentiMail.messageType.confirm, { "@FIRSTNAME@": dbUser.firstName, "@TOKEN@": token.token, "@USERNAME@": dbUser.userName })
			msg.to = {
				email: dbUser.email,
				name: dbUser.firstName + ' ' + dbUser.lastName
			}
			mailService.send(msg)
			break;
		case entityService.userState.approve:
			break;
		case entityService.userState.confirmWithPassword:
			token = await tokenService.createUserToken(dbUser.id, sentiToken.confirmUserWithPassword, { days: 7 })
			msg = await mailService.getMailMessageFromTemplateType(6, { "@FIRSTNAME@": dbUser.firstName, "@TOKEN@": token.token, "@USERNAME@": dbUser.userName })
			msg.to = {
				email: dbUser.email,
				name: dbUser.firstName + ' ' + dbUser.lastName
			}
			mailService.send(msg)
			break;
	}
	res.status(200).json(await entity.getUserById(dbUser.id))
})
router.put('/v2/entity/user/:uuid', async (req, res) => {
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
router.delete('/v2/entity/user/:uuid', async (req, res) => {
	let lease = await authClient.getLease(req)
	if (lease === false) {
		res.status(401).json()
		return
	}
	// Test MY ACCESS
	let acl = new aclClient()
	let access = await acl.testPrivileges(lease.uuid, req.params.uuid, [Privilege.user.delete])
	if (access.allowed === false) {
		res.status(403).json()
		return
	}
	let entity = new entityService()
	let dbUser = await entity.getDbUserByUUID(req.params.uuid)
	let success = await entity.deleteUser(dbUser.id)
	if (success === false) {
		res.status(500).json()
		return
	}
	await acl.deleteEntity(req.params.uuid)
	await acl.deleteResource(req.params.uuid)
	res.status(200).json()
})
router.put('/v2/entity/user/:uuid/internal', async (req, res) => {
	let lease = await authClient.getLease(req)
	if (lease === false) {
		res.status(401).json()
		return
	}
	// Test MY ACCESS
	let acl = new aclClient()
	let access = await acl.testPrivileges(lease.uuid, req.params.uuid, [Privilege.user.modify])
	if (access.allowed === false) {
		res.status(403).json()
		return
	}
	let entity = new entityService()
	let user = await entity.getDbUserByUUID(req.params.uuid)
	// Assign changed data and update user
	user.internal = req.body
	await entity.updateUser(user)
	res.status(200).json((await entity.getDbUserById(user.id)).internal)
})

router.post('/v2/entity/user/confirm', async (req, res) => {
	let credentials = new RequestCredentials(req.body)
	let tokenService = new sentiToken(mysqlConn)
	let userToken = await tokenService.getUserTokenByTokenAndType(credentials.token, sentiToken.confirmUser)
	if (userToken === false) {
		res.status(404).json()
		return
	}
	let entity = new entityService()
	let dbUser = await entity.getDbUserByUUID(userToken.uuid)
	if (dbUser === false) {
		res.status(404).json()
		return
	}
	credentials.id = dbUser.id
	let pwsuccess = await entity.setUserPassword(credentials)
	if (pwsuccess === false) {
		res.status(500).json()
		return
	}
	let statesuccess = await entity.setUserState(dbUser.id, 0)
	if (statesuccess === false) {
		res.status(500).json()
		return
	}	
	let mailService = new sentiMail(process.env.SENDGRID_API_KEY, mysqlConn)
	let msg = await mailService.getMailMessageFromTemplateType(sentiMail.messageType.passwordChanged, { "@FIRSTNAME@": dbUser.firstName, "@USERNAME@": dbUser.userName })
	msg.to = {
		email: dbUser.email,
		name: dbUser.firstName + ' ' + dbUser.lastName
	}
	mailService.send(msg)
	res.status(200).json(true)
})
router.post('/v2/entity/user/confirmwithpassword', async (req, res) => {
	let credentials = new RequestCredentials(req.body)
	let tokenService = new sentiToken(mysqlConn)
	let userToken = await tokenService.getUserTokenByTokenAndType(credentials.token, sentiToken.confirmUserWithPassword)
	if (userToken === false) {
		res.status(404).json()
		return
	}
	let entity = new entityService()
	let dbUser = await entity.getDbUserByUUID(userToken.uuid)
	if (dbUser === false) {
		res.status(404).json()
		return
	}
	let statesuccess = await entity.setUserState(dbUser.id, 0)
	if (statesuccess === false) {
		res.status(500).json()
		return
	}	
	res.status(200).json(true)
})
router.post('/v2/entity/user/forgotpassword', async (req, res) => {
	if (!req.body.email) {
		res.status(400).json()
		return
	}
	let entity = new entityService()
	let dbUser = await entity.getDbUserByUserName(req.body.email)
	if (dbUser === false) {
		res.status(404).json()
		return
	}
	if (dbUser.state > 0) {
		res.status(400).json()
		return
	}
	let mailService = new sentiMail(process.env.SENDGRID_API_KEY, mysqlConn)
	let tokenService = new sentiToken(mysqlConn)
	let token = await tokenService.createUserToken(dbUser.id, sentiToken.forgotPassword, { days: 1 })
	let msg = await mailService.getMailMessageFromTemplateType(sentiMail.messageType.forgotPassword, { "@FIRSTNAME@": dbUser.firstName, "@TOKEN@": token.token, "@USERNAME@": dbUser.userName })
	msg.to = {
		email: dbUser.email,
		name: dbUser.firstName + ' ' + dbUser.lastName
	}
	mailService.send(msg)
	res.status(200).json()
})
router.post('/v2/entity/user/forgotpassword/set', async (req, res) => {
	let credentials = new RequestCredentials(req.body)
	let tokenService = new sentiToken(mysqlConn)
	let userToken = await tokenService.getUserTokenByTokenAndType(credentials.token, sentiToken.forgotPassword)
	if (userToken === false) {
		res.status(404).json()
		return
	}
	let entity = new entityService()
	let dbUser = await entity.getDbUserByUUID(userToken.uuid)
	if (dbUser === false) {
		res.status(404).json()
		return
	}
	credentials.id = dbUser.id
	let pwsuccess = await entity.setUserPassword(credentials)
	if (pwsuccess === false) {
		res.status(500).json()
		return
	}
	let mailService = new sentiMail(process.env.SENDGRID_API_KEY, mysqlConn)
	let msg = await mailService.getMailMessageFromTemplateType(sentiMail.messageType.passwordChanged, { "@FIRSTNAME@": dbUser.firstName, "@USERNAME@": dbUser.userName })
	msg.to = {
		email: dbUser.email,
		name: dbUser.firstName + ' ' + dbUser.lastName
	}
	mailService.send(msg)
	tokenService.clearTokensByUserId(dbUser.id, sentiToken.forgotPassword)
	res.status(200).json(true)
})
router.post('/v2/entity/user/:uuid/setpassword', async (req, res) => {
	let lease = await authClient.getLease(req)
	if (lease === false) {
		res.status(401).json()
		return
	}
	// Test MY ACCESS
	let acl = new aclClient()
	let access = await acl.testPrivileges(lease.uuid, req.params.uuid, [Privilege.user.modify])
	if (access.allowed === false) {
		res.status(403).json()
		return
	}
	let credentials = new RequestCredentials(req.body)
	if (lease.uuid === req.params.uuid) {
		// check og valider eksisterende password
	}
	let entity = new entityService()
	let dbUser = await entity.getDbUserByUUID(req.params.uuid)
	if (dbUser === false) {
		res.status(404).json()
		return
	}
	credentials.id = dbUser.id
	let pwsuccess = await entity.setUserPassword(credentials)
	if (pwsuccess === false) {
		res.status(500).json()
		return
	}
	let mailService = new sentiMail(process.env.SENDGRID_API_KEY, mysqlConn)
	let msg = await mailService.getMailMessageFromTemplateType(sentiMail.messageType.passwordChanged, { "@FIRSTNAME@": dbUser.firstName, "@USERNAME@": dbUser.userName })
	msg.to = {
		email: dbUser.email,
		name: dbUser.firstName + ' ' + dbUser.lastName
	}
	mailService.send(msg)
	res.status(200).json()
})
router.post('/v2/entity/user/:uuid/resendconfirmmail', async (req, res) => {
	let lease = await authClient.getLease(req)
	if (lease === false) {
		res.status(401).json()
		return
	}
	// Test MY ACCESS
	let acl = new aclClient()
	let access = await acl.testPrivileges(lease.uuid, req.params.uuid, [Privilege.user.modify])
	if (access.allowed === false) {
		res.status(403).json()
		return
	}
	let credentials = new RequestCredentials(req.body)
	if (req.params.uuid !== credentials.uuid) {
		res.status(400).json()
		return
	}
	let entity = new entityService()
	let dbUser = await entity.getDbUserByUUID(req.params.uuid)
	if (dbUser === false) {
		res.status(404).json()
		return
	}
	if (dbUser.state !== 2) {
		res.status(400).json()
		return
	}
	let tokenService = new sentiToken(mysqlConn)
	tokenService.clearTokensByUserId(dbUser.id, sentiToken.confirmUser)
	let mailService = new sentiMail(process.env.SENDGRID_API_KEY, mysqlConn)
	let token = await tokenService.createUserToken(dbUser.id, sentiToken.confirmUser, { days: 7 })
	let msg = await mailService.getMailMessageFromTemplateType(sentiMail.messageType.confirm, { "@FIRSTNAME@": dbUser.firstName, "@TOKEN@": token.token, "@USERNAME@": dbUser.userName })
	msg.to = {
		email: dbUser.email,
		name: dbUser.firstName + ' ' + dbUser.lastName
	}
	mailService.send(msg)

	res.status(200).json()
})
module.exports = router