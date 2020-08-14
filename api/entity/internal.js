const express = require('express')
const router = express.Router()

const mysqlConn = require('../../mysql/mysql_handler')

const authClient = require('../../server').authClient
const entityService = require('../../lib/entity/entityService')

const sentiToken = require('senti-apicore').sentiToken
const sentiMail = require('senti-apicore').sentiMail


const RequestOrganisation = require('../../lib/entity/dataClasses/RequestOrganisation')
const RequestUser = require('../../lib/entity/dataClasses/RequestUser')
const RequestCredentials = require('../../lib/entity/dataClasses/RequestCredentials')

const aclClient = require('../../server').aclClient

const Privilege = require('../../lib/acl/dataClasses/Privilege')
const ResourceType = require('../../lib/acl/dataClasses/ResourceType')
const { exit } = require('process')

const createAPI = require('apisauce').create

router.get('/v1/internal/mail/test', async (req, res) => {

	let mailService = new sentiMail(process.env.SENDGRID_API_KEY, mysqlConn)
	let wlHost = (req.headers['wlhost']) ? req.headers['wlhost'] : 'waterworks.senti.io'
	let msg = await mailService.getMailMessageFromTemplateType(sentiMail.messageType.confirmHasPassword, { "@FIRSTNAME@": 'Mikkel', "@TOKEN@": '12345', "@USERNAME@": 'mb@webhouse.dk', "@ORGNICKNAME@": 'jowjowfirma' }, wlHost)
	msg.to = {
		email: 'hhtest@odeum.com',
		name: '`JOW JOW'
	}
	mailService.send(msg)
	res.status(200).json(msg)
})


router.get('/v2/internal/organisation/:uuid/fix', async (req, res) => {
	let lease = await authClient.getLease(req)
	if (lease === false) {
		res.status(401).json()
		return
	}
	let entity = new entityService()
	let org = await entity.getDbOrganisationByUUID(req.params.uuid)

	let parentAclResources = await entity.getAclOrgResourcesOnName(org.parentOrgId)
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

	res.status(200).json(org)
})

router.post('/v1/internal/mail/send', async (req, res) => {
	let lease = await authClient.getLease(req)
	if (lease === false) {
		res.status(401).json()
		return
	}
	let access = await aclClient.testPrivileges(lease.uuid, '00000000-0000-0000-0000-000000000000', [Privilege.internal.mail])
	console.log(access)
	if (access.allowed === false) {
		res.status(403).json()
		return
	}

	let sendMail = new sendMail()
	let result = await sendMail.send(req.body)
	res.status(200).json(result)
})

router.post('/v2/internal/initaclroot', async (req, res) => {
	let entity = new entityService()
	
	let org = await entity.getRootOrganisation()
	let aclResources = await entity.getAclResources()
	// if (aclResources === false) {
	// 	let aOrgResources = [1, 2, 3, 5, 7, 8, 14]
	// 	await Promise.all(Object.entries(ResourceType).map(async ([key, type]) => {
	// 		await entity.dbSaveAclResource({ "name": key, "type": type, internal: { isOrgResource: aOrgResources.includes(type) } })
	// 	}))
	// 	aclResources = await entity.getAclResources()
	// }
	// Register ACLORG ON ROOT as 00000000-0000-0000-0000-000000000000
	await entity.dbSaveAclOrgResource(org.id, aclResources.filter(r => r.type === 1)[0].id, '00000000-0000-0000-0000-000000000000')
	let aclOrgResources = await entity.createAclOrgResources(org)

	// Register ACL ORG as resource
	let aclOrgResource = await aclClient.registerResource(aclOrgResources.aclorg.uuid, ResourceType.aclorg)
	// Register org as entity
	let orgEntity = await aclClient.registerEntity(org.uuid)
	// Register org as resource under ACL ORG
	let orgResource = await aclClient.registerResource(org.uuid, ResourceType.org)
	if (orgEntity.uuid !== orgResource.uuid) {
		console.log('Something went really wrong...')
	}
	if (orgResource.uuid !== aclOrgResource.uuid) {
		await aclClient.addResourceToParent(orgResource.uuid, aclOrgResource.uuid)
	}

	// Register aclOrgResources and add them to ORG
	await Promise.all(Object.entries(aclOrgResources).map(async ([, aclResource]) => {
		if (aclResource.type !== 1 && aclResource.type !== 2 && aclResource.type !== 3) {
			await aclClient.registerResource(aclResource.uuid, aclResource.type)
			await aclClient.addResourceToParent(aclResource.uuid, orgResource.uuid)
		}
	}))
	
	// Check for ROLES or create some...
	// let roles = await entity.getRoles()
	// if (roles === false) {
	// 	await localCreateRoles()
	// 	roles = await entity.getRoles()
	// }

	// Check for ORGROLES or create some...
	// let orgRoles = await entity.createAclOrganisationRoles(org.id)
	// console.log(orgRoles)
	// await Promise.all(orgRoles.map(async (orgRole) => {
	// 	// Register role as entity under org
	// 	await aclClient.registerEntity(orgRole.aclUUID)
	// 	await aclClient.addEntityToParent(orgRole.aclUUID, orgEntity.uuid)
	// 	// Add initial privileges for role on org->aclResources
	// 	await Promise.all(Object.entries(orgRole.internal.initialPrivileges).map(async ([key, privileges]) => {
	// 		let p = await aclClient.addPrivileges(orgRole.aclUUID, aclOrgResources[key].uuid, privileges)
	// 		//console.log(orgRole.uuid, aclOrgResources[key].uuid, privileges, p)
	// 	}))
	// }))
	let orgRoles = await entity.createAclOrganisationRoles(org.id)
	await orgRoles.reduce(async (promise, orgRole) => {
		// This line will wait for the last async function to finish.
		// The first iteration uses an already resolved Promise
		// so, it will immediately continue.
		await promise;
		// Register role as entity under org
		await aclClient.registerEntity(orgRole.aclUUID)
		await aclClient.addEntityToParent(orgRole.aclUUID, orgEntity.uuid)
		await Object.entries(orgRole.internal.initialPrivileges).reduce(async (mypromise, [key, privileges]) => {
			await mypromise;
			let p = await aclClient.addPrivileges(orgRole.aclUUID, aclOrgResources[key].uuid, privileges)
		}, Promise.resolve())

	}, Promise.resolve())
	res.status(200).json(org)
})

router.get('/v2/internal/organisation/allaclfix', async (req, res) => {
	let lease = await authClient.getLease(req)
	if (lease === false) {
		res.status(401).json()
		return
	}
	let entity = new entityService()

	let select = `SELECT *
	FROM (
		SELECT O1.id, 0 as parentId, 1 as niveau
		FROM sentidatastorage_dev.organisation O1
		WHERE O1.parentOrgId=0
	) o1
	UNION
	SELECT *
	FROM (
		SELECT O2.id, O2.parentOrgId as parentId, 2 as niveau
		FROM sentidatastorage_dev.organisation O1
		INNER JOIN sentidatastorage_dev.organisation O2 ON O2.parentOrgId=O1.id
		WHERE O1.parentOrgId=0
	) o2
	UNION
	SELECT *
	FROM (
		SELECT O3.id, O3.parentOrgId as parentId, 3 as niveau
		FROM sentidatastorage_dev.organisation O1
		INNER JOIN sentidatastorage_dev.organisation O2 ON O2.parentOrgId=O1.id
		INNER JOIN sentidatastorage_dev.organisation O3 ON O3.parentOrgId=O2.id
		WHERE O1.parentOrgId=0
	) o3
	UNION
	SELECT *
	FROM (
		SELECT O4.id, O4.parentOrgId as parentId, 4 as niveau
		FROM sentidatastorage_dev.organisation O1
		INNER JOIN sentidatastorage_dev.organisation O2 ON O2.parentOrgId=O1.id
		INNER JOIN sentidatastorage_dev.organisation O3 ON O3.parentOrgId=O2.id
		INNER JOIN sentidatastorage_dev.organisation O4 ON O4.parentOrgId=O3.id
		WHERE O1.parentOrgId=0
	) o4
	ORDER BY niveau, id`
	let rs = await mysqlConn.query(select, [])
	if (rs[0].length === 0) {
		return false
	}
	let result = []

	rs[0].shift()


	// Alternativ til Promise.all
	await rs[0].reduce(async (promise, row) => {
		// This line will wait for the last async function to finish.
		// The first iteration uses an already resolved Promise
		// so, it will immediately continue.
		await promise;
		let org = await entity.getDbOrganisationById(row.id)
		console.log(org)

		let parentAclResources = await entity.getAclOrgResourcesOnName(row.parentId)
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
		result.push(org)
	}, Promise.resolve())

	res.status(200).json(result)
})

router.get('/v2/internal/users/allaclfix', async (req, res) => {
	let lease = await authClient.getLease(req)
	if (lease === false) {
		res.status(401).json()
		return
	}

	let select = `SELECT u.uuid as userUUID, ao.uuid as orgUUID, aor.uuid as roleUUID 
	FROM user u
		INNER JOIN aclOrganisationResource ao ON ao.orgId = u.orgId
		INNER JOIN aclResource ares ON ao.resourceId = ares.id AND ares.type = 5
		INNER JOIN aclOrganisationRole aor ON aor.orgId = u.orgId AND aor.roleId = u.roleId`
	let rs = await mysqlConn.query(select, [])
	if (rs[0].length === 0) {
		return false
	}
	let result = []

	// rs[0].shift()
	// Alternativ til Promise.all
	await rs[0].reduce(async (promise, row) => {
		// This line will wait for the last async function to finish.
		// The first iteration uses an already resolved Promise
		// so, it will immediately continue.
		await promise;
		// let org = await entity.getDbOrganisationById(row.id)
		console.log(row)

		// Register user
		await aclClient.registerEntity(row.userUUID)
		// Add user to Role
		await aclClient.addEntityToParent(row.userUUID, row.roleUUID)
		// Register user as resource
		await aclClient.registerResource(row.userUUID, ResourceType.user)
		// Add resource to organisation
		await aclClient.addResourceToParent(row.userUUID, row.orgUUID)
		// Give user permission to read, edit and delete there own resource
		await aclClient.addPrivileges(row.userUUID, row.userUUID, [Privilege.user.read, Privilege.user.modify, Privilege.user.delete])

		result.push(row)
	}, Promise.resolve())
	res.status(200).json(result)
})

router.get('/v2/internal/users/waterworksaclfix', async (req, res) => {
	let lease = await authClient.getLease(req)
	if (lease === false) {
		res.status(401).json()
		return
	}

	let select = `SELECT uuid, internal->'$.sentiWaterworks.devices' FROM user WHERE NOT ISNULL(internal->'$.sentiWaterworks.devices')`
	let rs = await mysqlConn.query(select, [])
	if (rs[0].length === 0) {
		return false
	}
	let result = []

	// rs[0].shift()
	// Alternativ til Promise.all
	await rs[0].reduce(async (promise, row) => {
		// This line will wait for the last async function to finish.
		// The first iteration uses an already resolved Promise
		// so, it will immediately continue.
		await promise;
		// let org = await entity.getDbOrganisationById(row.id)
		console.log(row)
		// await aclClient.addPrivileges(req.params.useruuid, req.params.deviceuuid, [Privilege.device.read])

		result.push(row)
	}, Promise.resolve())
	res.status(200).json(result)
})

router.post('/entity/organisation/createroot', async (req, res) => {
	let entity = new entityService()
	
	let org = await entity.getRootOrganisation()
	if (org === false) {
		let requestOrg = new RequestOrganisation()
		requestOrg.name = "Uden tilhørsforhold"
		requestOrg.uuname = "sentiroot"
		requestOrg.parentOrgId = 0
		org = await entity.createOrganisation(requestOrg)
	}
	let aclResources = await entity.getAclResources()
	if (aclResources === false) {
		let aOrgResources = [1, 2, 3, 5, 7, 8, 14]
		await Promise.all(Object.entries(ResourceType).map(async ([key, type]) => {
			await entity.dbSaveAclResource({ "name": key, "type": type, internal: { isOrgResource: aOrgResources.includes(type) } })
		}))
		aclResources = await entity.getAclResources()
	}
	// Register ACLORG ON ROOT as 00000000-0000-0000-0000-000000000000
	await entity.dbSaveAclOrgResource(org.id, aclResources.filter(r => r.type === 1)[0].id, '00000000-0000-0000-0000-000000000000')

	let aclOrgResources = await entity.createAclOrgResources(org)

	// Register ACL ORG as resource
	let aclOrgResource = await aclClient.registerResource(aclOrgResources.aclorg.uuid, ResourceType.aclorg)
	// Register org as entity
	let orgEntity = await aclClient.registerEntity(org.uuid)
	// Register org as resource under ACL ORG
	let orgResource = await aclClient.registerResource(org.uuid, ResourceType.org)
	if (orgEntity.uuid !== orgResource.uuid) {
		console.log('Something went really wrong...')
	}
	await aclClient.addResourceToParent(orgResource.uuid, aclOrgResource.uuid)

	// Register aclOrgResources and add them to ORG
	await Promise.all(Object.entries(aclOrgResources).map(async ([, aclResource]) => {
		if (aclResource.type !== 1 && aclResource.type !== 3) {
			await aclClient.registerResource(aclResource.uuid, aclResource.type)
			await aclClient.addResourceToParent(aclResource.uuid, orgResource.uuid)
		}
	}))
	
	// Check for ROLES or create some...
	let roles = await entity.getRoles()
	if (roles === false) {
		await localCreateRoles()
		roles = await entity.getRoles()
	}

	// Check for ORGROLES or create some...
	let orgRoles = await entity.createAclOrganisationRoles(org.id)
	console.log(orgRoles)
	await Promise.all(orgRoles.map(async (orgRole) => {
		// Register role as entity under org
		await aclClient.registerEntity(orgRole.aclUUID)
		await aclClient.addEntityToParent(orgRole.aclUUID, orgEntity.uuid)
		// Add initial privileges for role on org->aclResources
		await Promise.all(Object.entries(orgRole.internal.initialPrivileges).map(async ([key, privileges]) => {
			let p = await aclClient.addPrivileges(orgRole.aclUUID, aclOrgResources[key].uuid, privileges)
			//console.log(orgRole.uuid, aclOrgResources[key].uuid, privileges, p)
		}))
		// Alternativ til Promise.all
		// await Object.entries(orgRole.internal.initialPrivileges).reduce(async (promise, [key, privileges]) => {
		// 	// This line will wait for the last async function to finish.
		// 	// The first iteration uses an already resolved Promise
		// 	// so, it will immediately continue.
		// 	await promise;
		// 	await aclClient.addPrivileges(orgRole.uuid, aclOrgResources[key].uuid, privileges)
		//   }, Promise.resolve());

	}))
	//console.log(orgRoles.filter(role => { return role.roleId === 1 })[0])

	// ADD USERS administrator and system to root aclorg
	let administrator = await entity.getUserByUserName('administrator')
	if (administrator === false) {
		let requestUser = new RequestUser()
		requestUser.userName = 'administrator'
		requestUser.firstName = 'System'
		requestUser.lastName = 'Administrator'
		requestUser.email = 'support@senti.cloud'
		requestUser.state = 0
		requestUser.orgId = org.id
		requestUser.role = orgRoles.filter(role => { return role.roleId === 2 })[0]
		requestUser.roleId = requestUser.role.roleId
		administrator = await entity.createUser(requestUser)
	}
	await aclClient.registerEntity(administrator.uuid)
	await aclClient.addEntityToParent(administrator.uuid, orgRoles.filter(role => { return role.roleId === 2 })[0].aclUUID)

	await aclClient.registerResource(administrator.uuid, ResourceType.user)
	await aclClient.addResourceToParent(administrator.uuid, aclOrgResources.users.uuid)

	let dbAdm = await entity.getDbUserByUUID(administrator.uuid)
	let admPass = new RequestCredentials({ id: dbAdm.id, newPassword: req.body.admpass })
	await entity.setUserPassword(admPass)

	let systemuser = await entity.getUserByUserName('system')
	if (systemuser === false) {
		let requestSystemUser = new RequestUser()
		requestSystemUser.userName = 'system'
		requestSystemUser.firstName = 'System'
		requestSystemUser.lastName = 'Administrator'
		requestSystemUser.email = 'support@senti.cloud'
		requestSystemUser.state = 0
		requestSystemUser.orgId = org.id
		requestSystemUser.role = orgRoles.filter(role => { return role.roleId === 1 })[0]
		requestSystemUser.roleId = requestSystemUser.role.roleId
		systemuser = await entity.createUser(requestSystemUser)
	}
	await aclClient.registerEntity(systemuser.uuid)
	await aclClient.addEntityToParent(systemuser.uuid, orgRoles.filter(role => { return role.roleId === 1 })[0].aclUUID)

	await aclClient.registerResource(systemuser.uuid, ResourceType.user)
	await aclClient.addResourceToParent(systemuser.uuid, aclOrgResources.users.uuid)

	let dbSys = await entity.getDbUserByUUID(systemuser.uuid)
	let sysPass = new RequestCredentials({ id: dbSys.id, newPassword: req.body.syspass })
	await entity.setUserPassword(sysPass)


	res.status(200).json(org)
})


router.post('/entity/organisation/test', async (req, res) => {
	const localBackend = createAPI({
		baseURL: process.env.BACKENDTURL,
		headers: {
			'Accept': 'application/json',
			'Content-Type': 'application/json',
			'User-Agent': 'Senti.io v1',
			'Authorization': 'Bearer 18d38a5cd8bb29f802d2cee51739611f1549b9730b8360739f6629f302121bed'
		}
	})
	let test = await localBackend.get('entity/organisation/0fd794c2-9de9-4c6d-8ec1-da53deaa5f56').then(rs => {
		console.log('entity/organisation/0fd794c2-9de9-4c6d-8ec1-da53deaa5f56', rs.ok)
		return rs.data
	})
	res.status(200).json(test)
})


router.post('/entity/organisation/import', async (req, res) => {
	const betaBackend = createAPI({
		baseURL: 'https://betabackend.senti.cloud/rest/',
		headers: {
			'Accept': 'application/json',
			'Content-Type': 'application/json',
			'User-Agent': 'Senti.io v1',
			'ODEUMAuthToken': '88173d64d90bb7af7622f2ca2fc845e2'
		}
	})
	
	const localBackend = createAPI({
		baseURL: process.env.BACKENDTURL,  //'http://127.0.0.1:5023/',
		headers: {
			'Accept': 'application/json',
			'Content-Type': 'application/json',
			'User-Agent': 'Senti.io v1',
			'Authorization': 'Bearer ' + req.body.token
		}
	})
	let odeumOrgs = await betaBackend.get('core/orgs').then(rs => {
		console.log('core/orgs', rs.ok)
		return rs.data
	})
	let odeumToUUID = {
		'-1': req.body.rootUUID
	 }

	 let counter = 0
	 
	 let entity = new entityService()

	// Alternativ til Promise.all
	await Object.entries(odeumOrgs).reduce(async (promise, [key, odeumOrg]) => {
		// This line will wait for the last async function to finish.
		// The first iteration uses an already resolved Promise
		// so, it will immediately continue.
		await promise;
		counter++
		/*
		if (counter > 1) {
			return
		}
		*/
		let singleOdeumOrg = await betaBackend.get('core/org/' + odeumOrg.id).then(rs => {
			console.log('core/org/' + odeumOrg.id, rs.ok)
			return rs.data
		})
		let customerUUID = await entity.getCustomerUUID(singleOdeumOrg.id)
		if (customerUUID !== false) {
			singleOdeumOrg.uuname = customerUUID
		} else {
			singleOdeumOrg.uuname = entity.getUUName(singleOdeumOrg.name)
			await entity.createOldCustomer(singleOdeumOrg.uuname, singleOdeumOrg.name, singleOdeumOrg.id)
		}
		singleOdeumOrg.nickname = (singleOdeumOrg.nickname !== "") ? singleOdeumOrg.nickname : entity.getNickname(singleOdeumOrg.name)
		singleOdeumOrg.aux.odeumId = singleOdeumOrg.id
		singleOdeumOrg.website = singleOdeumOrg.url
		singleOdeumOrg.id = null
		singleOdeumOrg.org = {
			"uuid": odeumToUUID[odeumOrg.org.id]
		}
		console.log(singleOdeumOrg)

		let test = await localBackend.post('v2/entity/organisation', singleOdeumOrg).then(rs => {
			console.log('v2/entity/organisation', rs.ok)
			return rs.data
		})
		if (typeof odeumToUUID[odeumOrg.id] === 'undefined') {
			odeumToUUID[odeumOrg.id] = test.uuid
		}
		console.log(test)
	}, Promise.resolve());
	console.log(odeumToUUID)
	res.status(200).json()
})


// USER IMPORT

router.post('/entity/user/import', async (req, res) => {
	let lease = await authClient.getLease(req)
	if (lease === false) {
		res.status(401).json()
		return
	}

	const betaBackend = createAPI({
		baseURL: process.env.OLDBACKENDTURL,
		headers: {
			'Accept': 'application/json',
			'Content-Type': 'application/json',
			'User-Agent': 'Senti.io v1',
			'ODEUMAuthToken': '88173d64d90bb7af7622f2ca2fc845e2'
		}
	})
	const localBackend = createAPI({
		baseURL: process.env.BACKENDTURL,  //'http://127.0.0.1:5023/', //process.env.BACKENDTURL,
		headers: {
			'Accept': 'application/json',
			'Content-Type': 'application/json',
			'User-Agent': 'Senti.io v1',
			'Authorization': 'Bearer ' + req.body.token
		}
	})
	//console.log('su, ac, u:', 136550100000143, 136550100000211, 136550100000225)

	/* 
	let acl = new aclClient()
	let resources = await aclClient.findResources(lease.uuid, '00000000-0000-0000-0000-000000000000', ResourceType.org, Privilege.organisation.read)
	console.log(resources) */

	 
	let odeumUsers = await betaBackend.get('core/users').then(rs => {
		console.log('core/users', rs.ok)
		return rs.data
	})
	//console.log(odeumUsers)

	let organisations = await localBackend.get('v2/entity/organisations').then(rs => {
		console.log('v2/entity/organisations', rs.ok)
		return rs.data
	})
	//console.log(organisations)
	let counter = 0
	let result = []
	const crypto = require('crypto');
	function importPWHash(password) {
		return crypto.createHash('sha256').update(process.env.PASSWORDSALT + password).digest('hex')
	}

	await Object.entries(odeumUsers).reduce(async (promise, [key, odeumUser]) => {
		// This line will wait for the last async function to finish.
		// The first iteration uses an already resolved Promise
		// so, it will immediately continue.
		await promise;
		counter++
		/*
		if (counter > 2) {
			return
		}
 		*/
		let singleOdeumUser = await betaBackend.get('core/user/' + odeumUser.id).then(rs => {
			console.log('core/user/' + odeumUser.id, rs.ok)
			//console.log(rs.status)
			return rs.data
		})
		let extraOdeumUserData = await betaBackend.get('senti/mb/' + odeumUser.id).then(rs => {
			console.log('core/user/' + odeumUser.id, rs.ok)
			return rs.data
		})
		extraOdeumUserData.odeumOrgId = singleOdeumUser.org.id
		extraOdeumUserData.odeumOrgId__ = odeumUser.org.id
		
		extraOdeumUserData.roleUUID = false
		extraOdeumUserData.internal = singleOdeumUser.aux
		extraOdeumUserData.internal.odeumId = singleOdeumUser.id
		singleOdeumUser.aux = null
		delete singleOdeumUser.groups
		delete singleOdeumUser.privileges
		extraOdeumUserData.created = singleOdeumUser.created
		extraOdeumUserData.orgUUID = organisations.filter(item => { 
			return (item.aux !== null && item.aux.odeumId) ? item.aux.odeumId == singleOdeumUser.org.id : false
		})[0].uuid

		req.body.roles.forEach(item => {
			if (odeumUser.groups[item.odeumId]) {
				console.log(odeumUser.groups[item.odeumId], item.roleUUID)	
				extraOdeumUserData.roleUUID = item.roleUUID
			}
		})
		if (extraOdeumUserData.roleUUID === false) {
			return
		}
		console.log(extraOdeumUserData)
		singleOdeumUser.state = 0
		singleOdeumUser.org = { uuid: extraOdeumUserData.orgUUID }
		singleOdeumUser.role = { uuid: extraOdeumUserData.roleUUID }

		let requestUser = new RequestUser(singleOdeumUser)

		let user = await localBackend.post('v2/entity/user', requestUser).then(rs => {
			console.log('v2/entity/user', rs.ok)
			if (!rs.ok) {
				console.log(rs.status) // , rs.statusMessage
				return false
			}
			return rs.data
		})
		if (user === false) {
			return
		}

		let entity = new entityService()
		let dbUser = await entity.getDbUserByUUID(user.uuid)
		dbUser.internal = extraOdeumUserData.internal
		dbUser.state = singleOdeumUser.suspended
		await entity.updateUser(dbUser)
		await entity.setUserCreated(dbUser.id, extraOdeumUserData.created)
		await entity.setUserPassword({ id: dbUser.id, newPassword: extraOdeumUserData.password }, importPWHash)
		if (extraOdeumUserData.token !== null) {
			let tokenService = new sentiToken(mysqlConn)
			let token = await tokenService.createToken(extraOdeumUserData.token)
			let usertoken = await tokenService.createUserTokenWithExixtingToken(token, dbUser.id, sentiToken.confirmUser, { "date": extraOdeumUserData.expire })
			console.log(usertoken)
		}
	}, Promise.resolve());
	/* 
	console.log(organisations.filter(item => { 
		return (item.aux !== null && item.aux.odeumId) ? item.aux.odeumId == '138230100010185' : false
	}))
 */

	console.log()

	res.status(200).json()
})

router.post('/entity/organisation/initroot', async (req, res) => {
	let entity = new entityService()
	let requestOrg = new RequestOrganisation()

	requestOrg.uuname = entity.getUUName(requestOrg.name)
	let org = await entity.createOrganisation(requestOrg)



	//let org = await entity.getDbOrganisationById(1)


	let aclResources = await entity.createAclOrgResources(org)
	console.log(aclResources)

	// ER KOMMET HER TIL PÅ CREATEROOT

	// Register ACL ORG as resource
	let aclOrgResource = await aclClient.registerResource(aclResources['aclorg'].uuid, ResourceType.aclorg)
	// Register org as entity
	let orgEntity = await aclClient.registerEntity(org.uuid)
	// Register org as resource under ACL ORG
	let orgResource = await aclClient.registerResource(org.uuid, ResourceType.org)
	if (orgEntity.uuid !== orgResource.uuid) {
		console.log('Something went really wrong...')
	}
	await aclClient.addResourceToParent(orgResource.uuid, aclOrgResource.uuid)
	// Register aclResources and add them to ORG
	Object.entries(aclResources).forEach(async ([, aclResource]) => {
		if (aclResource.type !== 0 && aclResource.type !== 2) {
			await aclClient.registerResource(aclResource.uuid, aclResource.type)
			await aclClient.addResourceToParent(aclResource.uuid, orgResource.uuid)
		}
	})
	// Get organisation roles
	let orgRoles = await entity.createAclOrganisationRoles(org.id)

	orgRoles.forEach(async orgRole => {
		// Register role as entity under org
		await aclClient.registerEntity(orgRole.uuid)
		await aclClient.addEntityToParent(orgRole.uuid, orgEntity.uuid)
		if (orgRole.type === 1) {
			await aclClient.addEntityToParent("ee53c864-d226-46da-ba8a-e28825940189", orgRole.uuid)
		}

		// Add initial privileges for role on org->aclResources
		console.log(orgRole.internal.initialPrivileges)
		Object.entries(orgRole.internal.initialPrivileges).forEach(async ([key, privileges]) => {
			let p = await aclClient.addPrivileges(orgRole.uuid, aclResources[key].uuid, privileges)
			console.log(orgRole.uuid, aclResources[key].uuid, privileges, p)
		})
	})

	
	
	

	res.status(200).json(org)
})

async function localCreateRoles() {
	let entity = new entityService()
	let arrPrivileges = []
	Object.entries(Privilege).forEach(([, privileges]) => {
		Object.entries(privileges).forEach(([key, privilege]) => {
			//console.log(key, privilege)
			arrPrivileges.push(privilege)
		})
	})
	
	await entity.dbSaveRole({ name: "System User", type: 1, priority: 0, "internal": { initialPrivileges: { aclorg: arrPrivileges } } })
	await entity.dbSaveRole({ name: "Super User", type: 2, priority: 10, "internal": { initialPrivileges: { appui: ["waterworks.data", "waterworks.admin"], aclorg: arrPrivileges } } })
	let aclorgPrivileges = [
		"org.read",
		"org.create",
		"org.modify",
		"org.changeparent",
		"org.delete",
		"org.list",
		"group.read",
		"group.create",
		"group.modify",
		"group.changeparent",
		"group.delete",
		"group.list",
		"user.read",
		"user.create",
		"user.modify",
		"user.changeparent",
		"user.delete",
		"user.list",
		"device.read",
		"device.create",
		"device.modify",
		"device.changeparent",
		"device.delete",
		"device.list",
		"deviceType.read",
		"deviceType.create",
		"deviceType.modify",
		"deviceType.changeparent",
		"deviceType.delete",
		"deviceType.list",
		"registry.read",
		"registry.create",
		"registry.modify",
		"registry.changeparent",
		"registry.delete",
		"registry.list",
		"cloudfunction.read",
		"cloudfunction.create",
		"cloudfunction.modify",
		"cloudfunction.changeparent",
		"cloudfunction.delete",
		"cloudfunction.list",
		"subscription.read",
		"subscription.create",
		"subscription.modify",
		"subscription.changeparent",
		"subscription.delete",
		"subscription.list",
		"dashboard.read",
		"dashboard.create",
		"dashboard.modify",
		"dashboard.changeparent",
		"dashboard.share",
		"dashboard.delete",
		"dashboard.list"
	]
	let orgAccountPrivileges = [
		"org.read",
		"org.modify",
		"group.read",
		"group.create",
		"group.modify",
		"group.delete",
		"user.read",
		"user.create",
		"user.modify",
		"user.delete",
		"device.read",
		"device.create",
		"device.modify",
		"device.delete",
		"deviceType.read",
		"deviceType.create",
		"deviceType.modify",
		"deviceType.delete",
		"registry.read",
		"registry.create",
		"registry.modify",
		"registry.delete",
		"cloudfunction.read",
		"cloudfunction.create",
		"cloudfunction.modify",
		"cloudfunction.delete",
		"subscription.read",
		"subscription.create",
		"subscription.modify",
		"subscription.delete",
		"dashboard.read",
		"dashboard.create",
		"dashboard.modify",
		"dashboard.share",
		"dashboard.delete",
	]
	await entity.dbSaveRole({ name: "Account Manager", type: 3, priority: 50, "internal": { initialPrivileges: { org: orgAccountPrivileges } } })
	let orgPrivileges = [
		"org.read",
		"group.read",
		"user.read",
		"device.read",
		"registry.read",
		"dashboard.read",
		"dashboard.create",
		"dashboard.modify",
		"dashboard.share",
		"dashboard.delete",
	]
	await entity.dbSaveRole({ name: "User", type: 4, priority: 100, "internal": { initialPrivileges: { org: orgPrivileges } } })
	await entity.dbSaveRole({ name: "Waterworks User", type: 5, priority: 1000, "internal": { initialPrivileges: { appui: ["waterworks.data"] } } })
}

class HTTPError extends Error {
	statusCode
	message

	constructor(code, message) {
		super(message)
		this.statusCode = code
		this.name = 'HTTPError ' + code
		this.message = message
	}
}
router.post('/entity/organisation/error', async (req, res) => {
	try {
		throw new HTTPError(401)
	} 
	catch (e) {
		console.log(e)
		res.statusMessage = e.message
		res.status(e.statusCode).json()	
		return
	}
	res.status(200).json()
})


module.exports = router