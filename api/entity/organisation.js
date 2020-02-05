const express = require('express')
const router = express.Router()
const authClient = require('../../lib/authentication/authClient')
const entityService = require('../../lib/entity/entityService')

const RequestOrganisation = require('../../lib/entity/dataClasses/RequestOrganisation')
const RequestUser = require('../../lib/entity/dataClasses/RequestUser')
const RequestCredentials = require('../../lib/entity/dataClasses/RequestCredentials')

const aclClient = require('../../lib/acl/aclClient')
const Privilege = require('../../lib/acl/dataClasses/Privilege')
const ResourceType = require('../../lib/acl/dataClasses/ResourceType')

const createAPI = require('apisauce').create

router.get('/entity/organisation/:uuid', async (req, res) => {
	let lease = await authClient.getLease(req)
	if (lease === false) {
		res.status(401).json()
		return
	}
	// ACL lease.uuid Privilege.organisation.read user req.params.uuid
	let acl = new aclClient()
	let access = await acl.testPrivileges(lease.uuid, req.params.uuid, [Privilege.organisation.read])
	if (access.allowed === false) {
		res.status(403).json()
		return
	}
	let entity = new entityService()
	let organisation = await entity.getOrganisationByUUID(req.params.uuid)
	res.status(200).json(organisation)
})
router.post('/entity/organisation', async (req, res) => {
	let lease = await authClient.getLease(req)
	if (lease === false) {
		res.status(401).json()
		return
	}
	let acl = new aclClient()
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
	let access = await acl.testPrivileges(lease.uuid, parentOrg.uuid, [Privilege.organisation.create])
	if (access.allowed === false) {
		res.status(403).json()
		return
	}
	requestOrg.uuname = entity.getUUName(requestOrg.name)
	let org = await entity.createOrganisation(requestOrg)
	let parentAclResources = await entity.getAclOrgResourcesOnName(parentOrg.id)
	let aclOrgResources = await entity.createAclOrgResources(org)
	// Register ACL ORG as resource
	let aclOrgResource = await acl.registerResource(aclOrgResources['aclorg'].uuid, ResourceType.aclorg)
	await acl.addResourceToParent(aclOrgResource.uuid, parentAclResources['aclorg'].uuid)

	// Register org as entity
	let orgEntity = await acl.registerEntity(org.uuid)
	// Register org as resource under ACL ORG
	let orgResource = await acl.registerResource(org.uuid, ResourceType.org)
	if (orgEntity.uuid !== orgResource.uuid) {
		console.log('Something went really wrong...')
		res.status(400).json()
		return
	}
	await acl.addResourceToParent(orgResource.uuid, aclOrgResource.uuid)
	// Register aclOrgResources and add them to ORG
	await Promise.all(Object.entries(aclOrgResources).map(async ([, aclResource]) => {
		if (aclResource.type !== 1 && aclResource.type !== 3) {
			await acl.registerResource(aclResource.uuid, aclResource.type)
			await acl.addResourceToParent(aclResource.uuid, orgResource.uuid)
		}
	}))
	// Get organisation roles
	let orgRoles = await entity.createAclOrganisationRoles(org.id)
	await Promise.all(orgRoles.map(async (orgRole) => {
		// Register role as entity under org
		await acl.registerEntity(orgRole.aclUUID)
		await acl.addEntityToParent(orgRole.aclUUID, orgEntity.uuid)
		// Add initial privileges for role on org->aclResources
		await Promise.all(Object.entries(orgRole.internal.initialPrivileges).map(async ([key, privileges]) => {
			let p = await acl.addPrivileges(orgRole.aclUUID, aclOrgResources[key].uuid, privileges)
			//console.log(orgRole.uuid, aclOrgResources[key].uuid, privileges, p)
		}))
	}))
	let resultOrg = await entity.getOrganisationById(org.id)
	res.status(200).json(resultOrg)
})
router.put('/entity/organisation/:uuid', async (req, res) => {
	let lease = await authClient.getLease(req)
	if (lease === false) {
		res.status(401).json()
		return
	}
	let acl = new aclClient()
	let entity = new entityService()
	let requestOrg = new RequestOrganisation(req.body)
	// Test MY ACCESS
	let access = await acl.testPrivileges(lease.uuid, req.params.uuid, [Privilege.organisation.modify])
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
		let changeParentAccess = await acl.testPrivileges(lease.uuid, requestParentOrg.uuid, [Privilege.organisation.create])
		if (changeParentAccess.allowed === false) {
			res.status(403).json()
			return
		}
		let requestParentAclResources = await entity.getAclOrgResourcesOnName(requestParentOrg.id)
		let parentAclResources = await entity.getAclOrgResourcesOnName(org.parentOrgId)
		let orgAclResources = await entity.getAclOrgResourcesOnName(org.id)

		await acl.removeResourceFromParent(orgAclResources['aclorg'].uuid, parentAclResources['aclorg'].uuid)
		await acl.addResourceToParent(orgAclResources['aclorg'].uuid, requestParentAclResources['aclorg'].uuid)
	}
	org.assignDiff(requestOrg);
	let updatedOrg = await entity.updateOrganisation(org)
	let resultOrg = await entity.getOrganisationById(updatedOrg.id)
	res.status(200).json(resultOrg)
})
router.delete('/entity/organisation/:uuid', async (req, res) => {
	let lease = await authClient.getLease(req)
	if (lease === false) {
		res.status(401).json()
		return
	}
	let acl = new aclClient()
	let access = await acl.testPrivileges(lease.uuid, req.params.uuid, [Privilege.organisation.delete])
	if (access.allowed === false) {
		res.status(403).json()
		return
	}
	let entity = new entityService()
	let org = await entity.getDbOrganisationByUUID(req.params.uuid)
	//let deletedOrg = await entity.deleteOrganisation(org)
	res.status(200).json()
})
router.get('/entity/organisation/:uuid/resourcegroups', async (req, res) => {
	let lease = await authClient.getLease(req)
	if (lease === false) {
		res.status(401).json()
		return
	}
	let acl = new aclClient()
	let access = await acl.testPrivileges(lease.uuid, req.params.uuid, [Privilege.organisation.read])
	if (access.allowed === false) {
		res.status(403).json()
		return
	}
	let entity = new entityService()

	let org = await entity.getDbOrganisationByUUID(req.params.uuid)
	let orgAclResources = await entity.getAclOrgResourcesOnName(org.id)
	res.status(200).json(orgAclResources)
})





router.post('/entity/organisation/createroot', async (req, res) => {
	let acl = new aclClient()
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
	let aclOrgResource = await acl.registerResource(aclOrgResources.aclorg.uuid, ResourceType.aclorg)
	// Register org as entity
	let orgEntity = await acl.registerEntity(org.uuid)
	// Register org as resource under ACL ORG
	let orgResource = await acl.registerResource(org.uuid, ResourceType.org)
	if (orgEntity.uuid !== orgResource.uuid) {
		console.log('Something went really wrong...')
	}
	await acl.addResourceToParent(orgResource.uuid, aclOrgResource.uuid)

	// Register aclOrgResources and add them to ORG
	await Promise.all(Object.entries(aclOrgResources).map(async ([, aclResource]) => {
		if (aclResource.type !== 1 && aclResource.type !== 3) {
			await acl.registerResource(aclResource.uuid, aclResource.type)
			await acl.addResourceToParent(aclResource.uuid, orgResource.uuid)
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
		await acl.registerEntity(orgRole.aclUUID)
		await acl.addEntityToParent(orgRole.aclUUID, orgEntity.uuid)
		// Add initial privileges for role on org->aclResources
		await Promise.all(Object.entries(orgRole.internal.initialPrivileges).map(async ([key, privileges]) => {
			let p = await acl.addPrivileges(orgRole.aclUUID, aclOrgResources[key].uuid, privileges)
			//console.log(orgRole.uuid, aclOrgResources[key].uuid, privileges, p)
		}))
		// Alternativ til Promise.all
		/* await Object.entries(orgRole.internal.initialPrivileges).reduce(async (promise, [key, privileges]) => {
			// This line will wait for the last async function to finish.
			// The first iteration uses an already resolved Promise
			// so, it will immediately continue.
			await promise;
			await acl.addPrivileges(orgRole.uuid, aclOrgResources[key].uuid, privileges)
		  }, Promise.resolve()); */

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
	await acl.registerEntity(administrator.uuid)
	await acl.addEntityToParent(administrator.uuid, orgRoles.filter(role => { return role.roleId === 2 })[0].aclUUID)

	await acl.registerResource(administrator.uuid, ResourceType.user)
	await acl.addResourceToParent(administrator.uuid, aclOrgResources.users.uuid)

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
	await acl.registerEntity(systemuser.uuid)
	await acl.addEntityToParent(systemuser.uuid, orgRoles.filter(role => { return role.roleId === 1 })[0].aclUUID)

	await acl.registerResource(systemuser.uuid, ResourceType.user)
	await acl.addResourceToParent(systemuser.uuid, aclOrgResources.users.uuid)

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
		baseURL: process.env.OLDBACKENDTURL,
		headers: {
			'Accept': 'application/json',
			'Content-Type': 'application/json',
			'User-Agent': 'Senti.io v1',
			'ODEUMAuthToken': '88173d64d90bb7af7622f2ca2fc845e2'
		}
	})
	const localBackend = createAPI({
		baseURL: process.env.BACKENDTURL,
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
		singleOdeumOrg.aux.odeumId = singleOdeumOrg.id
		singleOdeumOrg.uuname = singleOdeumOrg.nickname
		singleOdeumOrg.website = singleOdeumOrg.url
		singleOdeumOrg.id = null
		singleOdeumOrg.org = {
			"uuid": odeumToUUID[odeumOrg.org.id]
		}
		console.log(singleOdeumOrg)

		let test = await localBackend.post('entity/organisation', singleOdeumOrg).then(rs => {
			console.log('entity/organisation', rs.ok)
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
router.post('/entity/organisation/importusers', async (req, res) => {
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
		baseURL: process.env.BACKENDTURL,
		headers: {
			'Accept': 'application/json',
			'Content-Type': 'application/json',
			'User-Agent': 'Senti.io v1',
			'Authorization': 'Bearer 18d38a5cd8bb29f802d2cee51739611f1549b9730b8360739f6629f302121bed'
		}
	})
	console.log('su, ac, u:', 136550100000143, 136550100000211, 136550100000225)

	let odeumUsers = await betaBackend.get('core/users').then(rs => {
		console.log('core/users', rs.ok)
		return rs.data
	})
	console.log(odeumUsers)
	let test = await localBackend.get('entity/organisations').then(rs => {
		console.log('entity/organisations', rs.ok)
		return rs.data
	})

	await Object.entries(odeumUsers).reduce(async (promise, [key, odeumUser]) => {
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
		/*
		let singleOdeumOrg = await betaBackend.get('core/org/' + odeumOrg.id).then(rs => {
			console.log('core/org/' + odeumOrg.id, rs.ok)
			return rs.data
		})
		singleOdeumOrg.aux.odeumId = singleOdeumOrg.id
		singleOdeumOrg.uuname = singleOdeumOrg.nickname
		singleOdeumOrg.id = null
		singleOdeumOrg.org = {
			"uuid": odeumToUUID[odeumOrg.org.id]
		}
		console.log(singleOdeumOrg)

		let test = await localBackend.post('entity/organisation', singleOdeumOrg).then(rs => {
			console.log('entity/organisation', rs.ok)
			return rs.data
		})
		if (typeof odeumToUUID[odeumOrg.id] === 'undefined') {
			odeumToUUID[odeumOrg.id] = test.uuid
		}
		console.log(test)
		*/
	}, Promise.resolve());

	console.log(test.filter(item => { 
		return (item.aux !== null && item.aux.odeumId) ? item.aux.odeumId == '138230100010185' : false
	}))

	res.status(200).json()

})

router.post('/entity/organisation/initroot', async (req, res) => {
	let acl = new aclClient()
	let entity = new entityService()
	let requestOrg = new RequestOrganisation()

	requestOrg.uuname = entity.getUUName(requestOrg.name)
	let org = await entity.createOrganisation(requestOrg)



	//let org = await entity.getDbOrganisationById(1)


	let aclResources = await entity.createAclOrgResources(org)
	console.log(aclResources)


	// ER KOMMET HER TIL PÅ CREATEROOT

	// Register ACL ORG as resource
	let aclOrgResource = await acl.registerResource(aclResources['aclorg'].uuid, ResourceType.aclorg)
	// Register org as entity
	let orgEntity = await acl.registerEntity(org.uuid)
	// Register org as resource under ACL ORG
	let orgResource = await acl.registerResource(org.uuid, ResourceType.org)
	if (orgEntity.uuid !== orgResource.uuid) {
		console.log('Something went really wrong...')
	}
	await acl.addResourceToParent(orgResource.uuid, aclOrgResource.uuid)
	// Register aclResources and add them to ORG
	Object.entries(aclResources).forEach(async ([, aclResource]) => {
		if (aclResource.type !== 0 && aclResource.type !== 2) {
			await acl.registerResource(aclResource.uuid, aclResource.type)
			await acl.addResourceToParent(aclResource.uuid, orgResource.uuid)
		}
	})
	// Get organisation roles
	let orgRoles = await entity.createAclOrganisationRoles(org.id)

	orgRoles.forEach(async orgRole => {
		// Register role as entity under org
		await acl.registerEntity(orgRole.uuid)
		await acl.addEntityToParent(orgRole.uuid, orgEntity.uuid)
		if (orgRole.type === 1) {
			await acl.addEntityToParent("ee53c864-d226-46da-ba8a-e28825940189", orgRole.uuid)
		}

		// Add initial privileges for role on org->aclResources
		console.log(orgRole.internal.initialPrivileges)
		Object.entries(orgRole.internal.initialPrivileges).forEach(async ([key, privileges]) => {
			let p = await acl.addPrivileges(orgRole.uuid, aclResources[key].uuid, privileges)
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
	await entity.dbSaveRole({ name: "Super User", type: 2, priority: 10, "internal": { initialPrivileges: { aclorg: arrPrivileges } } })
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