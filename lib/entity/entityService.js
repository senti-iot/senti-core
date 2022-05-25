const uuidv4 = require('uuid/v4');

var moment = require('moment');
var mysqlConn = require('../../mysql/mysql_handler')

const authClient = require('../../server').authClient

const User = require('./dataClasses/User')
const InternalUser = require('./dataClasses/InternalUser')
const DbUser = require('./dataClasses/DbUser')
const DbCredentials = require('./dataClasses/DbCredentials')
const Organisation = require('./dataClasses/Organisation')
const DbOrganisation = require('./dataClasses/DbOrganisation')
const DbOrganisationRole = require('./dataClasses/DbOrganisationRole')
const DbRole = require('./dataClasses/DbRole')
const Role = require('./dataClasses/Role')
const DbAclResource = require('./dataClasses/DbAclResource')
const AclResource = require('./dataClasses/AclResource')

const ResourceType = require('../acl/dataClasses/ResourceType')

const sqlUserFields = `U.uuid, U.userName, U.firstName, U.lastName, U.email, U.phone, U.mobile,
	U.aux, U.orgId, U.roleId, U.state, U.deleted, U.created, U.modified`
const sqlOrganisationFields = `O.uuid, O.uuname, O.name, O.nickname, O.address, O.zip, O.city, O.region, O.country,
	O.website, O.aux, O.parentOrgId, O.created, O.modified`

class entityService {
	static userState = {
		ok: 0,
		suspended: 1,
		confirm: 2,
		approve: 3,
		confirmWithPassword: 4
	}
	// db = null

	// constructor(db) {
	// 	this.db = db
	// }
	/**
	 *
	 * @param {String[]} uuids
	 */
	async getUsersByUUID(uuids = false) {
		if (uuids === false) {
			return []
		}
		let clause = (uuids.length > 0) ? ' AND U.uuid IN (?' + ",?".repeat(uuids.length - 1) + ') ' : ''
		let select = `SELECT ${sqlUserFields},
			MAX(UT.created) as lastLoggedIn
			 , PO.uuid as parentUUID, IFNULL(PO.name, '') as parentName
			 , R.uuid as roleUUID, R.type as roleType, R.name as roleName
			FROM user U
				LEFT JOIN userToken UT ON UT.userId = U.id AND UT.type = 1
				LEFT JOIN organisation PO ON U.orgId = PO.id
				INNER JOIN role R ON U.roleId = R.id
			WHERE U.deleted = 0 ${clause}
			GROUP BY U.id;`
		let rs = await mysqlConn.query(select, uuids)
		if (rs[0].length === 0) {
			return []
		}
		let result = []
		rs[0].forEach(async row => {
			let user = new User(row)
			user.created = moment(user.created).format()
			user.modified = moment(user.modified).format()
			user.lastLoggedIn = user.lastLoggedIn !== null ? moment(user.lastLoggedIn).format() : null
			if (row.parentOrgId === 0) {
				user.org = false
			} else {
				let po = new Organisation()
				po.uuid = row.parentUUID
				po.name = row.parentName
				user.org = po
			}
			let userRole = new Role()
			userRole.uuid = row.roleUUID
			userRole.type = row.roleType
			userRole.name = row.roleName
			user.role = userRole
			result.push(user)
		})
		return result
	}
	/**
	 *
	 * @param {Number} id
	 */
	async getUserById(id) {
		let select = `SELECT ${sqlUserFields},
				MAX(UT.created) as lastLoggedIn
			FROM user U
				LEFT JOIN userToken UT ON UT.userId = U.id AND UT.type = 1
			WHERE U.id = ?
				AND U.deleted = 0;`

		let rs = await mysqlConn.query(select, [id])
		if (rs[0].length !== 1) {
			return false
		}
		let user = new User(rs[0][0])
		user.created = moment(user.created).format()
		user.modified = moment(user.modified).format()
		user.lastLoggedIn = user.lastLoggedIn !== null ? moment(user.lastLoggedIn).format() : null
		user.org = await this.getOrganisationById(rs[0][0].orgId)
		user.role = await this.getRole(rs[0][0].roleId)
		return user
	}
	async getUserByUUID(id) {
		let userSQL = `SELECT id FROM user U WHERE U.uuid = ?;`
		let rs = await mysqlConn.query(userSQL, [id])
		if (rs[0].length !== 1) {
			return false
		}
		return await this.getUserById(rs[0][0].id)
	}
	async getInternalUserByUUID(uuid) {
		let select = `SELECT id, internal FROM user U WHERE U.uuid = ?;`
		let rs = await mysqlConn.query(select, [uuid])
		if (rs[0].length !== 1) {
			return false
		}
		let user = await this.getUserById(rs[0][0].id);
		let internalUser = new InternalUser(user)
		internalUser.internal = rs[0][0].internal
		return internalUser
	}

	async getUserByUserName(userName) {
		let userSQL = `SELECT id FROM user U WHERE U.userName = ?;`
		let rs = await mysqlConn.query(userSQL, [userName])
		if (rs[0].length !== 1) {
			return false
		}
		return await this.getUserById(rs[0][0].id)
	}
	async getDbUserById(id) {
		let select = `SELECT id, uuid, userName, firstName, lastName, email, phone, mobile, aux, internal, orgId, roleId, state, deleted, created, modified
			FROM user U
			WHERE U.id = ?;`
		let rs = await mysqlConn.query(select, [id])
		if (rs[0].length !== 1) {
			return false
		}
		return new DbUser(rs[0][0])

	}
	async getDbUserByUUID(id) {
		let select = `SELECT id FROM user U WHERE U.uuid = ?;`
		let rs = await mysqlConn.query(select, [id])
		if (rs[0].length !== 1) {
			return false
		}
		return await this.getDbUserById(rs[0][0].id)
	}
	async getDbUserByUserName(userName) {
		let userSQL = `SELECT id FROM user U WHERE U.userName = ?;`
		let rs = await mysqlConn.query(userSQL, [userName])
		if (rs[0].length !== 1) {
			return false
		}
		return await this.getDbUserById(rs[0][0].id)
	}

	async createUser(user = false) {
		if (user === false) {
			return false
		}
		let dbO = new DbUser(user)
		dbO.uuid = uuidv4()
		let insert = `INSERT INTO user(uuid, userName, firstName, lastName, email, phone, mobile, aux, internal, orgId, roleId, state, deleted, created, modified)
			VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NOW(), NOW());`
		let rs = await mysqlConn.query(insert, [dbO.uuid, dbO.userName, dbO.firstName, dbO.lastName, dbO.email, dbO.phone, dbO.mobile,
			(dbO.aux !== null) ? JSON.stringify(dbO.aux) : dbO.aux,
			(dbO.internal !== null) ? JSON.stringify(dbO.internal) : dbO.internal,
			dbO.orgId, dbO.roleId, dbO.state])
		if (rs[0].affectedRows === 1) {
			return await this.getDbUserById(rs[0].insertId)
		}
		return false
	}
	async updateUser(user = false) {
		if (user === false) {
			return false
		}
		let dbO = new DbUser(user)
		let update = `UPDATE user
			SET userName = ?,
				firstName = ?,
				lastName = ?,
				email = ?,
				phone = ?,
				mobile = ?,
				aux = ?,
				internal = ?,
				orgId = ?,
				roleId = ?,
				state = ?,
				modified = NOW()
			WHERE id = ?;`
		let rs = await mysqlConn.query(update, [dbO.userName, dbO.firstName, dbO.lastName, dbO.email, dbO.phone, dbO.mobile,
			(dbO.aux !== null) ? JSON.stringify(dbO.aux) : dbO.aux,
			(dbO.internal !== null) ? JSON.stringify(dbO.internal) : dbO.internal,
			dbO.orgId, dbO.roleId, dbO.state, dbO.id])
		if (rs[0].affectedRows === 1) {
			return await this.getDbUserById(dbO.id)
		}
		return false
	}
	async deleteUser(user = false) {
		if (user === false) {
			return false
		}
		let dbO = new DbUser(user)
		let update = `UPDATE user
			SET deleted = 1,
				internal = JSON_SET(IFNULL(internal, '{}'), '$.previoususername', userName),
				userName = uuid,
				modified = NOW()
			WHERE id = ?;`
		// let sql = mysqlConn.format(update, [dbO.id])
		let rs = await mysqlConn.query(update, [dbO.id])
		if (rs[0].affectedRows === 1) {
			return true
		}
		return false
	}
	async setUserPassword(credentials = false, hashfunction = false) {
		if (credentials === false) {
			return false
		}
		let dbO = new DbCredentials(credentials)
		let update = `UPDATE user
			SET password = ?,
				modified = NOW()
			WHERE id = ?;`
		let pwd = (dbO.newPassword !== '') ? (hashfunction === false) ? authClient.getPWHash(dbO.newPassword) : hashfunction(dbO.newPassword) : ''
		let rs = await mysqlConn.query(update, [pwd, dbO.id])
		if (rs[0].affectedRows === 1) {
			return true
		}
		return false
	}
	async setUserCreated(id, created) {
		let update = `UPDATE user
			SET created = ?,
				modified = NOW()
			WHERE id = ?;`
		let rs = await mysqlConn.query(update, [created, id])
		if (rs[0].affectedRows === 1) {
			return true
		}
		return false
	}
	async setUserState(id, state) {
		let update = `UPDATE user
			SET state = ?,
				modified = NOW()
			WHERE id = ?;`
		let rs = await mysqlConn.query(update, [state, id])
		if (rs[0].affectedRows === 1) {
			return true
		}
		return false
	}
	async getOrganisationsByUUID(uuids = false) {
		if (uuids === false) {
			return false
		}
		let orgClause = (uuids.length > 0) ? ' AND O.uuid IN (?' + ",?".repeat(uuids.length - 1) + ') ' : ''
		let select = `SELECT ${sqlOrganisationFields}
			, PO.uuid as parentUUID, IFNULL(PO.name, '') as parentName
			FROM organisation O
				LEFT JOIN organisation PO ON O.parentOrgId = PO.id
			WHERE O.deleted = 0 ${orgClause};`
		let rs = await mysqlConn.query(select, uuids)
		if (rs[0].length === 0) {
			return false
		}
		let result = []
		rs[0].forEach(async rsOrg => {
			let organisation = new Organisation(rsOrg)
			if (rsOrg.parentOrgId === 0) {
				organisation.org = false
			} else {
				let po = new Organisation();
				po.uuid = rsOrg.parentUUID
				po.name = rsOrg.parentName
				organisation.org = po
			}
			organisation.created = moment(organisation.created).format()
			organisation.modified = moment(organisation.modified).format()
			result.push(organisation)
		})
		return result
	}

	async getOrganisationById(id) {
		let organisationByIdSQL = `SELECT ${sqlOrganisationFields}
			FROM organisation O
			WHERE O.id = ?
				AND O.deleted = 0;`

		let rs = await mysqlConn.query(organisationByIdSQL, [id])
		if (rs[0].length !== 1) {
			return false
		}
		let organisation = new Organisation(rs[0][0])
		organisation.created = moment(organisation.created).format()
		organisation.modified = moment(organisation.modified).format()
		if (rs[0][0].orgId !== 0) {
			organisation.org = await this.getOrganisationById(rs[0][0].parentOrgId)
		}
		return organisation
	}
	async getOrganisationByUUID(id) {
		let orgSQL = `SELECT id FROM organisation O WHERE O.uuid = ?;`
		let rs = await mysqlConn.query(orgSQL, [id])
		if (rs[0].length !== 1) {
			return false
		}
		return await this.getOrganisationById(rs[0][0].id)
	}
	async getDbOrganisationById(id) {
		let organisationByIdSQL = `SELECT id, uuid, uuname, name, nickname, address, zip, city, country, region, website, aux, internal, parentOrgId, deleted, created, modified
			FROM organisation O
			WHERE O.id = ?;`
		let rs = await mysqlConn.query(organisationByIdSQL, [id])
		if (rs[0].length !== 1) {
			return false
		}
		let organisation = new DbOrganisation(rs[0][0])
		return organisation
	}
	async getDbOrganisationByUUID(id) {
		let orgSQL = `SELECT id FROM organisation O WHERE O.uuid = ?;`
		let rs = await mysqlConn.query(orgSQL, [id])
		if (rs[0].length !== 1) {
			return false
		}
		return await this.getDbOrganisationById(rs[0][0].id)
	}
	async getOrganisationIdByUUID(uuid = false, deleted = 0) {
		if (uuid === false) {
			return false
		}
		let select = `SELECT id FROM organisation o WHERE o.uuid = ? AND o.deleted = ?`
		let rs = await mysqlConn.query(select, [uuid, deleted])
		if (rs[0].length !== 1) {
			return false
		}
		return rs[0][0].id
	}
	async getDbOrganisationsByUUID(uuids = false) {
		if (uuids === false) {
			return false
		}
		let orgClause = (uuids.length > 0) ? ' AND O.uuid IN (?' + ",?".repeat(uuids.length - 1) + ') ' : ''
		let select = `SELECT id, uuid, uuname, name, nickname, address, zip, city, region, country, website, aux, internal, parentOrgId, deleted, created, modified
			FROM organisation O
			WHERE O.deleted = 0 ${orgClause};`
		let rs = await mysqlConn.query(select, uuids)
		if (rs[0].length === 0) {
			return false
		}
		let result = []
		rs[0].forEach(async rsOrg => {
			let organisation = new DbOrganisation(rsOrg)
			result.push(organisation)
		})
		return result
	}
	async getSubOrgs(orgUUID) {
		let result = []
		//Get the org parentId
		let getOrgIdQuery = `SELECT id from organisation o where o.uuid = ?`
		let getOrgResult = await mysqlConn.query(getOrgIdQuery, [orgUUID])
		let orgId = getOrgResult[0][0].id
		if (orgId) {
			//Get the orgs having the parent ID
			let selectQuery = `SELECT id, uuid, name, parentOrgId from organisation o
			WHERE o.parentOrgId = ?
			`
			let selectResult = await mysqlConn.query(selectQuery, [orgId])
			result.push(...selectResult[0])
			let subs = [...selectResult[0]]
			//Recursive to find all Suborgs of suborgs
			await Promise.all(subs.map(async s => result.push(...await this.getSubOrgs(s.uuid)))).then(rs => rs)
		}
		return result
	}

	async getRootOrganisation() {
		let orgSQL = `SELECT id FROM organisation O WHERE O.parentOrgId = 0;`
		let rs = await mysqlConn.query(orgSQL)
		if (rs[0].length !== 1) {
			return false
		}
		return await this.getDbOrganisationById(rs[0][0].id)
	}
	async getCustomerUUID(id) {
		let orgSQL = `SELECT uuid FROM Customer O WHERE O.ODEUM_org_id = ?;`
		let rs = await mysqlConn.query(orgSQL, [id])
		if (rs[0].length !== 1) {
			return false
		}
		return rs[0][0].uuid
	}
	async createOldCustomer(uuid, name, odeumId) {
		let organisationSQL = `INSERT INTO Customer(uuid, name, ODEUM_org_id, deleted)
			VALUES(?, ?, ?, 0);`
		let rs = await mysqlConn.query(organisationSQL, [ uuid, name, odeumId ])
		if (rs[0].affectedRows === 1) {
			return true
		}
		return false
	}

	async createCustomer(org = false) {
		if (org === false) {
			return false
		}
		let dbO = new DbOrganisation(org)
		// dbO.uuid = uuidv4()
		let organisationSQL = `INSERT INTO customer(uuid, uuname, name, ODEUM_org_id, deleted)
			VALUES(?, ?, ?, ?, 0);`
		let odeumId = (dbO.aux !== null && dbO.aux.odeumId) ? dbO.aux.odeumId : 0
		let rs = await mysqlConn.query(organisationSQL, [dbO.uuid, dbO.uuname, dbO.name, odeumId])
		if (rs[0].affectedRows === 1) {
			return true
		}
		return false
	}
	async createOrganisation(org = false) {
		if (org === false) {
			return false
		}
		let dbO = new DbOrganisation(org)
		dbO.uuid = uuidv4()
		let organisationSQL = `INSERT INTO organisation(uuid, uuname, name, nickname, address, zip, city, region, country, website, aux, internal, parentOrgId, deleted, created, modified)
			VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NOW(), NOW());`

		let sql = await mysqlConn.format(organisationSQL, [dbO.uuid, dbO.uuname, dbO.name, dbO.nickname, dbO.address, dbO.zip, dbO.city, dbO.region, dbO.country, dbO.website,
			(dbO.aux !== null) ? JSON.stringify(dbO.aux) : dbO.aux,
			(dbO.internal !== null) ? JSON.stringify(dbO.internal) : dbO.internal,
			dbO.parentOrgId, dbO.deleted])
		console.log(sql)

		let rs = await mysqlConn.query(organisationSQL, [dbO.uuid, dbO.uuname, dbO.name, dbO.nickname, dbO.address, dbO.zip, dbO.city, dbO.region, dbO.country, dbO.website,
			(dbO.aux !== null) ? JSON.stringify(dbO.aux) : dbO.aux,
			(dbO.internal !== null) ? JSON.stringify(dbO.internal) : dbO.internal,
			dbO.parentOrgId, dbO.deleted])
		if (rs[0].affectedRows === 1) {
			return await this.getDbOrganisationById(rs[0].insertId)
		}
		return false
	}
	async updateOrganisation(org = false) {
		if (org === false) {
			return false
		}
		let dbO = new DbOrganisation(org)
		let organisationSQL = `UPDATE organisation
			SET uuname = ?,
				name = ?,
				nickname = ?,
				address = ?,
				zip = ?,
				city = ?,
				region = ?,
				country = ?,
				website = ?,
				aux = ?,
				internal = ?,
				parentOrgId = ?,
				modified = NOW()
			WHERE id = ?;`
		let rs = await mysqlConn.query(organisationSQL, [dbO.uuname, dbO.name, dbO.nickname, dbO.address, dbO.zip, dbO.city, dbO.region, dbO.country, dbO.website,
			(dbO.aux !== null) ? JSON.stringify(dbO.aux) : dbO.aux,
			(dbO.internal !== null) ? JSON.stringify(dbO.internal) : dbO.internal,
			dbO.parentOrgId, dbO.id])
		if (rs[0].affectedRows === 1) {
			return await this.getDbOrganisationById(dbO.id)
		}
		return false
	}
	async deleteOrganisation(org = false) {
		if (org === false) {
			return false
		}
		let dbO = new DbOrganisation(org)
		let organisationSQL = `UPDATE organisation
			SET deleted = 1,
				modified = NOW()
			WHERE id = ?;`
		let rs = await mysqlConn.query(organisationSQL, [dbO.id])
		if (rs[0].affectedRows === 1) {
			return await this.getDbOrganisationById(dbO.id)
		}
		return false
	}

	/**
	 * ROLES
	 */
	async getRoles(priority = 0) {
		let select = `SELECT uuid, name, type, priority, aux, created, modified FROM role WHERE priority >= ? ORDER BY priority;`
		let rs = await mysqlConn.query(select, [priority])
		if (rs[0].length === 0) {
			return false
		}
		let result = []
		rs[0].forEach(async role => {
			result.push(new Role(role))
		})
		return result
	}

	async getDbRoles() {
		let select = `SELECT id, uuid, name, type, priority, aux, internal, deleted, created, modified FROM role ORDER BY priority;`
		let rs = await mysqlConn.query(select)
		if (rs[0].length === 0) {
			return false
		}
		let result = []
		rs[0].forEach(async role => {
			result.push(new DbRole(role))
		})
		return result
	}
	async getRole(id) {
		let select = `SELECT uuid, name, type, priority, aux, created, modified FROM role WHERE id = ?;`
		let rs = await mysqlConn.query(select, [id])
		if (rs[0].length === 1) {
			return new Role(rs[0][0])
		}
		return false
	}
	async getRoleByUUID(uuid) {
		let select = `SELECT id FROM role WHERE uuid = ?;`
		let rs = await mysqlConn.query(select, [uuid])
		if (rs[0].length === 1) {
			return await this.getRole(rs[0][0].id)
		}
		return false
	}

	async dbSaveRole(role) {
		let dbO = new DbRole(role)
		let rs = false
		if (dbO.id === false) {
			dbO.uuid = uuidv4()
			let insert = `INSERT INTO role(uuid, name, type, priority, aux, internal, deleted, created, modified) VALUES(?, ?, ?, ?, ?, ?, 1, NOW(), NOW());`
			rs = await mysqlConn.query(insert, [dbO.uuid, dbO.name, dbO.type, dbO.priority,
				(dbO.aux !== null) ? JSON.stringify(dbO.aux) : dbO.aux,
				(dbO.internal !== null) ? JSON.stringify(dbO.internal) : dbO.internal
			])
		} else {
			let update = `UPDATE role SET name = ?, type = ?, priority = ?, aux = ?, internal = ?, deleted = ?, modified = NOW() WHERE id = ?;`
			rs = await mysqlConn.query(update, [dbO.name, dbO.type, dbO.priority,
				(dbO.aux !== null) ? JSON.stringify(dbO.aux) : dbO.aux,
				(dbO.internal !== null) ? JSON.stringify(dbO.internal) : dbO.internal,
				dbO.deleted, dbO.id
			])
		}
		if (rs !== false && rs[0].affectedRows === 1) {
			return true
		}
		return false
	}
	/**
	 * ACL ROLES
	 */
	async getAclOrganisationDbRoles(id) {
		let sql = `SELECT AOR.orgId, AOR.roleId, R.uuid, AOR.uuid as aclUUID, R.name, R.type, R.priority, R.aux, R.internal, R.created, R.modified FROM aclOrganisationRole AOR INNER JOIN role R ON AOR.roleId = R.id WHERE AOR.orgId = ?;`
		let rs = await mysqlConn.query(sql, [id])
		if (rs[0].length === 0) {
			return false
		}
		let result = []
		rs[0].forEach(orgRole => {
			result.push(new DbOrganisationRole(orgRole))
		})
		return result
	}
	async getAclOrganisationRole(orgId, roleId) {
		let roleSQL = `SELECT AOR.orgId, AOR.roleId, R.uuid, AOR.uuid as aclUUID, R.name, R.type, R.priority, R.aux, R.internal, R.created, R.modified FROM aclOrganisationRole AOR INNER JOIN role R ON AOR.roleId = R.id WHERE AOR.orgId = ? AND R.id = ?;`
		let rs = await mysqlConn.query(roleSQL, [orgId, roleId])
		if (rs[0].length === 0) {
			return false
		}
		if (rs[0].length === 1) {
			return new DbOrganisationRole(rs[0][0])
		}
		return false
	}
	async getAclOrganisationRoleByUUID(orgId, uuid) {
		let roleSQL = `SELECT AOR.orgId, AOR.roleId, R.uuid, AOR.uuid as aclUUID, R.name, R.type, R.priority, R.aux, R.internal, R.created, R.modified FROM aclOrganisationRole AOR INNER JOIN role R ON AOR.roleId = R.id WHERE AOR.orgId = ? AND R.uuid = ?;`
		let rs = await mysqlConn.query(roleSQL, [orgId, uuid])
		if (rs[0].length === 0) {
			return false
		}
		if (rs[0].length === 1) {
			return new DbOrganisationRole(rs[0][0])
		}
		return false
	}

	async dbSaveAclOrganisationRole(orgId, roleId) {
		let insert = `INSERT IGNORE INTO aclOrganisationRole(orgId, roleId, uuid) VALUES(?, ?, ?);`
		let rs = await mysqlConn.query(insert, [orgId, roleId, uuidv4()])
		if (rs[0].affectedRows === 1) {
			return true
		}
		return false
	}
	async createAclOrganisationRoles(id) {
		let roles = await this.getDbRoles()
		if (roles === false) {
			return false
		}
		await Promise.all(roles.map(async (role) => {
			await this.dbSaveAclOrganisationRole(id, role.id)
		}))
		return await this.getAclOrganisationDbRoles(id)
	}

	/**
	 * ACL RESOURCES
	 */
	async getAclResources() {
		let sql = `SELECT id, uuid, name, type, aux, internal, deleted, created, modified FROM aclResource;`
		let rs = await mysqlConn.query(sql)
		if (rs[0].length === 0) {
			return false
		}
		let result = []
		rs[0].forEach(role => {
			result.push(new DbAclResource(role))
		})
		return result
	}
	async getAclOrgResources(id) {
		let sql = `SELECT AOR.orgId, R.id, AOR.uuid, R.name, R.type, R.aux, R.internal, R.created, R.modified, R.deleted FROM aclOrganisationResource AOR INNER JOIN aclResource R ON AOR.resourceId = R.id WHERE AOR.orgId = ?;`
		let rs = await mysqlConn.query(sql, [id])
		if (rs[0].length === 0) {
			return false
		}
		let result = []
		rs[0].forEach(orgResource => {
			result.push(new DbAclResource(orgResource))
		})
		return result
	}
	async getAclOrgResourcesOnName(id) {
		let rs = await this.getAclOrgResources(id)
		if (rs === false) {
			return false
		}
		let result = {}
		rs.forEach(orgResource => {
			result[orgResource.name] = new AclResource(orgResource)
		})
		return result
	}

	async dbSaveAclOrgResource(orgId, resourceId, uuid = false) {
		if (uuid === false) {
			uuid = uuidv4()
		}
		let sql = `INSERT IGNORE INTO aclOrganisationResource(orgId, resourceId, uuid) VALUES(?, ?, ?);`
		let rs = await mysqlConn.query(sql, [orgId, resourceId, uuid])
		if (rs[0].affectedRows === 1) {
			return true
		}
		return false
	}
	async dbSaveAclResource(aclResource) {
		let dbO = new DbAclResource(aclResource)
		let rs = false
		if (dbO.id === false) {
			dbO.uuid = uuidv4()
			let insert = `INSERT INTO aclResource(uuid, name, type, aux, internal, deleted, created, modified) VALUES(?, ?, ?, ?, ?, 1, NOW(), NOW());`
			rs = await mysqlConn.query(insert, [dbO.uuid, dbO.name, dbO.type,
				(dbO.aux !== null) ? JSON.stringify(dbO.aux) : dbO.aux,
				(dbO.internal !== null) ? JSON.stringify(dbO.internal) : dbO.internal,
			])
		} else {
			let update = `UPDATE aclResource SET name = ?, type = ?, aux = ?, internal = ?, deleted = ?, modified = NOW() WHERE id = ?;`
			rs = await mysqlConn.query(update, [dbO.name, dbO.type,
				(dbO.aux !== null) ? JSON.stringify(dbO.aux) : dbO.aux,
				(dbO.internal !== null) ? JSON.stringify(dbO.internal) : dbO.internal,
				dbO.deleted, dbO.id
			])
		}
		if (rs !== false && rs[0].affectedRows === 1) {
			return true
		}
		return false
	}

	async createAclOrgResources(org) {
		let aclResources = await this.getAclResources()
		if (aclResources === false) {
			return false
		}
		//isOrgResource
		await Promise.all(aclResources.map(async (aclResource) => {
			if (aclResource.internal.isOrgResource) {
				if (aclResource.type === ResourceType.org) {
					await this.dbSaveAclOrgResource(org.id, aclResource.id, org.uuid)
				} else {
					await this.dbSaveAclOrgResource(org.id, aclResource.id)
				}
			}
		}))
		return await this.getAclOrgResourcesOnName(org.id)
	}
	shortHashGen(source) {
		// eslint-disable-next-line no-unused-vars
		var i = 0, j = 0, bitshift = 0, mask = 0x3f, mask0 = 0, mask1 = 0, val = 0;
		var block = [];
		//              0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef
		var dictionary = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_$";
		var result = "";
		let binsrc = []
		while (source.length >= 2) {
			binsrc.push(parseInt(source.substring(0, 2), 16));
			source = source.substring(2, source.length);
		}
		// init block of 8 bytes plus one guard byte
		for (i = 0; i < 9; i++) {
			block[i] = 0;
		}
		// fold input
		for (i = 0; i < binsrc.length; i++) {
			block[i % 8] = block[i % 8] ^ binsrc[i];
		}
		i = 0;
		while (i < 64) {
			j = i >> 3; // byte index
			bitshift = i % 8; // bit index
			mask0 = mask << bitshift;
			result = result + dictionary[(block[j] & mask0 & 0xff | block[j + 1] << 8 & mask0 & 0xff00) >> bitshift];
			i += 6;
		}
		return result;
	}
	getUUName(name) {
		return name.toLowerCase().replace(/ /g, "-").replace(/---/g, "-").replace(/--/g, "-").replace(/\//g, "") + '-' + this.shortHashGen(uuidv4())
	}
	getNickname(name) {
		return name.toLowerCase().replace(/ /g, "-").replace(/---/g, "-").replace(/--/g, "-").replace(/\//g, "")
	}
}
module.exports = entityService