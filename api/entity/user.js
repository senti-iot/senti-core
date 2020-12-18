const express = require('express')
const router = express.Router()

const mysqlConn = require('../../mysql/mysql_handler')

const authClient = require('../../server').authClient
const entityService = require('../../lib/entity/entityService')

const sentiToken = require('senti-apicore').sentiToken
const sentiMail = require('senti-apicore').sentiSmtpMail

const RequestUser = require('../../lib/entity/dataClasses/RequestUser')
const RequestCredentials = require('../../lib/entity/dataClasses/RequestCredentials')

const aclClient = require('../../server').aclClient
const Privilege = require('../../lib/acl/dataClasses/Privilege')
const ResourceType = require('../../lib/acl/dataClasses/ResourceType')

router.get('/v2/entity/user/:uuid', async (req, res) => {
	let lease = await authClient.getLease(req)
	if (lease === false) {
		res.status(401).json()
		return
	}
	let access = await aclClient.testPrivileges(lease.uuid, req.params.uuid, [Privilege.user.read])
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
	let entity = new entityService()
	let requestUser = new RequestUser(req.body)
	let parentOrg = (requestUser.org && requestUser.org.uuid) ? await entity.getDbOrganisationByUUID(requestUser.org.uuid) : 0
	if (parentOrg.id === 0) {
		//res.statusMessage = 'Bad request. Parent Organisation failure'
		res.status(400).json()
		return
	}
	requestUser.orgId = parentOrg.id
	// If defaultAUX is set on parentOrg set in internal
	console.log(parentOrg.aux)	
	// if (parentOrg.aux.defaultAUX) {
	// 	requestUser.internal.senti = parentOrg.aux.defaultAUX.senti
	// }
	// Test MY ACCESS
	let access = await aclClient.testPrivileges(lease.uuid, parentOrg.uuid, [Privilege.user.create])
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
	// Register user
	await aclClient.registerEntity(dbUser.uuid)
	// Add user to Role
	await aclClient.addEntityToParent(dbUser.uuid, requestUserRole.aclUUID)
	// Register user as resource
	await aclClient.registerResource(dbUser.uuid, ResourceType.user)
	// Add resource to organisation
	await aclClient.addResourceToParent(dbUser.uuid, orgAclResources.users.uuid)
	// Give user permission to read, edit and delete there own resource
	await aclClient.addPrivileges(dbUser.uuid, dbUser.uuid, [Privilege.user.read, Privilege.user.modify, Privilege.user.delete])

	// LOOP GROUPS AND ADD USER TO RESOURCE GROUPS -- and maybe later also entity groups(for special privileges)

	// Check state if i should create token and send mail

	// let mailService = new sentiMail(process.env.SENDGRID_API_KEY, mysqlConn)
	
	let wlHost = (req.headers['wlhost']) ? req.headers['wlhost'] : ''
	const mailService = new sentiMail(mysqlConn, wlHost)
	await mailService.smtpConnect()

	let tokenService = new sentiToken(mysqlConn)
	let token
	let msg
	

	switch (dbUser.state) {
		case entityService.userState.ok:
			if (requestUser.password !== false && requestUser.password !== '') {
				let credentials = new RequestCredentials({ id: dbUser.id, newPassword: requestUser.password })
				entity.setUserPassword(credentials)
			}
			break;
		case entityService.userState.confirm:
			token = await tokenService.createUserToken(dbUser.id, sentiToken.confirmUser, { days: 7 })
			msg = await mailService.getMailMessageFromTemplateType(sentiMail.messageType.confirm, { "@FIRSTNAME@": dbUser.firstName, "@TOKEN@": token.token, "@USERNAME@": dbUser.userName, "@ORGNICKNAME@": parentOrg.nickname }, wlHost)
			msg.to = {
				email: dbUser.email,
				name: dbUser.firstName + ' ' + dbUser.lastName
			}
			mailService.send(msg)
			break;
		case entityService.userState.approve:
			break;
		case entityService.userState.confirmWithPassword:
			if (requestUser.password !== false && requestUser.password !== '') {
				let credentials = new RequestCredentials({ id: dbUser.id, newPassword: requestUser.password })
				entity.setUserPassword(credentials)
			}
			token = await tokenService.createUserToken(dbUser.id, sentiToken.confirmUserWithPassword, { days: 7 })
			msg = await mailService.getMailMessageFromTemplateType(sentiMail.messageType.confirmHasPassword, { "@FIRSTNAME@": dbUser.firstName, "@TOKEN@": token.token, "@USERNAME@": dbUser.userName, "@ORGNICKNAME@": parentOrg.nickname }, wlHost)
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
	let access
	if (lease.uuid === req.params.uuid) {
		access = await aclClient.testPrivileges(lease.uuid, req.params.uuid, [Privilege.user.modify])
	} else {
		access = await aclClient.testPrivileges(lease.uuid, requestOrg.uuid, [Privilege.user.modify])
	}
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
		let changeParentAccess = await aclClient.testPrivileges(lease.uuid, requestOrg.uuid, [Privilege.user.create])
		if (changeParentAccess.allowed === false) {
			res.status(403).json()
			return
		}
		await aclClient.removeEntityFromParent(user.uuid, userRole.aclUUID)
		await aclClient.addEntityToParent(user.uuid, requestUserRole.aclUUID)

		let orgAclResources = await entity.getAclOrgResourcesOnName(user.orgId)
		let requestOrgAclResources = await entity.getAclOrgResourcesOnName(requestUser.orgId)

		await aclClient.removeResourceFromParent(user.uuid, orgAclResources.users.uuid)
		await aclClient.addResourceToParent(user.uuid, requestOrgAclResources.users.uuid)
	}
	
	// Check for ROLE Changes
	if (requestUser.roleId !== user.roleId) {
		await aclClient.removeEntityFromParent(user.uuid, userRole.aclUUID)
		await aclClient.addEntityToParent(user.uuid, requestUserRole.aclUUID)
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
	let access = await aclClient.testPrivileges(lease.uuid, req.params.uuid, [Privilege.user.delete])
	if (access.allowed === false) {
		res.status(403).json()
		return
	}
	let entity = new entityService()
	let dbUser = await entity.getDbUserByUUID(req.params.uuid)
	let success = await entity.deleteUser(dbUser)
	if (success === false) {
		res.status(500).json()
		return
	}
	await aclClient.deleteEntity(req.params.uuid)
	await aclClient.deleteResource(req.params.uuid)
	res.status(200).json()
})
router.get('/v2/entity/user/:uuid/internal', async (req, res) => {
	let lease = await authClient.getLease(req)
	console.log(lease)
	if (lease === false) {
		res.status(401).json()
		return
	}

	// Test MY ACCESS
	let access = await aclClient.testPrivileges(lease.uuid, req.params.uuid, [Privilege.user.modify, Privilege.user.changeparent])
	console.log(access)
	if (access.allowed === false) {
		res.status(403).json()
		return
	}
	let entity = new entityService()
	let internalUser = await entity.getInternalUserByUUID(req.params.uuid)
	let aclResources = await entity.getAclOrgResourcesOnName(await entity.getOrganisationIdByUUID(internalUser.org.uuid))
	let userPrivileges = await aclClient.listPrivileges(req.params.uuid, aclResources['appui'].uuid, true) 
	internalUser.privileges = userPrivileges.privileges.map(item => {
	 	return item.privilege
	})
	res.status(200).json(internalUser)
})
router.put('/v2/entity/user/:uuid/internal', async (req, res) => {
	let lease = await authClient.getLease(req)
	if (lease === false) {
		res.status(401).json()
		return
	}
	// Test MY ACCESS
	let access = await aclClient.testPrivileges(lease.uuid, req.params.uuid, [Privilege.user.modify])
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
	// let mailService = new sentiMail(process.env.SENDGRID_API_KEY, mysqlConn)
	// let wlHost = (req.headers['wlhost']) ? req.headers['wlhost'] : ''
	let wlHost = (req.headers['wlhost']) ? req.headers['wlhost'] : ''
	const mailService = new sentiMail(mysqlConn, wlHost)
	await mailService.smtpConnect()

	let msg = await mailService.getMailMessageFromTemplateType(sentiMail.messageType.passwordChanged, { "@FIRSTNAME@": dbUser.firstName, "@USERNAME@": dbUser.userName }, wlHost)
	msg.to = {
		email: dbUser.email,
		name: dbUser.firstName + ' ' + dbUser.lastName
	}
	mailService.send(msg)
	tokenService.clearTokensByUserId(dbUser.id, sentiToken.confirmUser)
	res.status(200).json(true)
})
router.post('/v2/entity/user/confirmwithpassword', async (req, res) => {
	let credentials = new RequestCredentials(req.body)
	let tokenService = new sentiToken(mysqlConn)
	let userToken = await tokenService.getUserTokenByTokenAndType(credentials.token, sentiToken.confirmUserWithPassword)
	console.log(userToken)
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
	tokenService.clearTokensByUserId(dbUser.id, sentiToken.confirmUserWithPassword)
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
	// let mailService = new sentiMail(process.env.SENDGRID_API_KEY, mysqlConn)
	let wlHost = (req.headers['wlhost']) ? req.headers['wlhost'] : ''
	const mailService = new sentiMail(mysqlConn, wlHost)
	await mailService.smtpConnect()

	let tokenService = new sentiToken(mysqlConn)
	let token = await tokenService.createUserToken(dbUser.id, sentiToken.forgotPassword, { days: 1 })
	// let wlHost = (req.headers['wlhost']) ? req.headers['wlhost'] : ''
	let msg = await mailService.getMailMessageFromTemplateType(sentiMail.messageType.forgotPassword, { "@FIRSTNAME@": dbUser.firstName, "@TOKEN@": token.token, "@USERNAME@": dbUser.userName }, wlHost)
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
	// let mailService = new sentiMail(process.env.SENDGRID_API_KEY, mysqlConn)
	// let wlHost = (req.headers['wlhost']) ? req.headers['wlhost'] : ''

	let wlHost = (req.headers['wlhost']) ? req.headers['wlhost'] : ''
	const mailService = new sentiMail(mysqlConn, wlHost)
	await mailService.smtpConnect()

	let msg = await mailService.getMailMessageFromTemplateType(sentiMail.messageType.passwordChanged, { "@FIRSTNAME@": dbUser.firstName, "@USERNAME@": dbUser.userName }, wlHost)
	msg.to = {
		email: dbUser.email,
		name: dbUser.firstName + ' ' + dbUser.lastName
	}
	mailService.send(msg)
	tokenService.clearTokensByUserId(dbUser.id, sentiToken.forgotPassword)
	res.status(200).json(true)
})
router.post('/v2/entity/user/:uuid/setpassword', async (req, res) => {
	console.log('SET PASSWORD', req.params, req.headers, req.body)
	let lease = await authClient.getLease(req)
	if (lease === false) {
		res.status(401).json()
		return
	}
	// Test MY ACCESS
	let access = await aclClient.testPrivileges(lease.uuid, req.params.uuid, [Privilege.user.modify])
	console.log('SET PW ACCESS', access)
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
	console.log('SET PW USER', dbUser)
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
	// let mailService = new sentiMail(process.env.SENDGRID_API_KEY, mysqlConn)
	// let wlHost = (req.headers['wlhost']) ? req.headers['wlhost'] : ''

	let wlHost = (req.headers['wlhost']) ? req.headers['wlhost'] : ''
	const mailService = new sentiMail(mysqlConn, wlHost)
	await mailService.smtpConnect()


	let msg = await mailService.getMailMessageFromTemplateType(sentiMail.messageType.passwordChanged, { "@FIRSTNAME@": dbUser.firstName, "@USERNAME@": dbUser.userName }, wlHost)
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
	let access = await aclClient.testPrivileges(lease.uuid, req.params.uuid, [Privilege.user.modify])
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
	// let mailService = new sentiMail(process.env.SENDGRID_API_KEY, mysqlConn)
	let wlHost = (req.headers['wlhost']) ? req.headers['wlhost'] : ''
	const mailService = new sentiMail(mysqlConn, wlHost)
	await mailService.smtpConnect()

	let token = await tokenService.createUserToken(dbUser.id, sentiToken.confirmUser, { days: 7 })
	// let wlHost = (req.headers['wlhost']) ? req.headers['wlhost'] : ''
	let msg = await mailService.getMailMessageFromTemplateType(sentiMail.messageType.confirm, { "@FIRSTNAME@": dbUser.firstName, "@TOKEN@": token.token, "@USERNAME@": dbUser.userName }, wlHost)
	msg.to = {
		email: dbUser.email,
		name: dbUser.firstName + ' ' + dbUser.lastName
	}
	mailService.send(msg)

	res.status(200).json()
})
module.exports = router