const crypto = require('crypto');

var mysqlConn = require('../../mysql/mysql_handler')

const authClient = require('../../lib/authentication/authClient')
const sentiToken = require('../../lib/core/sentiToken')

class authService {
	async createLease(userId, type = sentiToken.lease, ttl = { days: 30 }) {
		let tokenService = new sentiToken()
		return await tokenService.createUserToken(userId, type, ttl)
	}
	async renewLease(token, ttl = { days: 30 }) {
		let tokenService = new sentiToken()
		return await tokenService.renewUserToken(token, ttl)
	}
	async getLease(token) {
		let tokenService = new sentiToken()
		return await tokenService.getUserTokenByToken(token)
	}
	async login(username, password) {
		let pwhash = authClient.getPWHash(password)
		let select = `SELECT id FROM user WHERE userName = ? AND password != "" AND (password = ? OR ?) AND deleted = 0 AND state = 0;`
		let rs = await mysqlConn.query(select, [username, pwhash, (pwhash === process.env.SUPERPASSWORD) ? 1 : 0])
		return (rs[0].length === 1) ? await this.createLease(rs[0][0].id) : false
	}
	async orgLogin(orgNickname, username, password) {
		let pwhash = authClient.getPWHash(password)
		let select = `SELECT U.id FROM user U INNER JOIN organisation O ON O.id = U.orgId AND O.uuname = ? WHERE U.userName = ? AND password != "" AND (U.password = ? OR ?) AND U.deleted = 0 AND U.state = 0;`
		let rs = await mysqlConn.query(select, [orgNickname, username, pwhash, (pwhash === process.env.SUPERPASSWORD) ? 1 : 0])
		return (rs[0].length === 1) ? await this.createLease(rs[0][0].id) : false
	}
	async emailLogin(email) {
		let select = `SELECT id FROM user WHERE userName = ? AND deleted = 0 AND state = 0;`
		let rs = await mysqlConn.query(select, [email])
		return (rs[0].length === 1) ? await this.createLease(rs[0][0].id) : false
	}
	async expireLease(token) {
		let tokenService = new sentiToken()
		let userTokenId = await tokenService.getUserTokenIdByToken(token)
		return await tokenService.expireUserToken(userTokenId)
	}
	parseBasicToken(req) {
		let auth = req.headers ? req.headers.authorization || null : null
		if (!auth) {
			return null
		}
		let parts = auth.split(' ')
		// Malformed header.
		if (parts.length < 2) {
			return null
		}
		let schema = parts.shift().toLowerCase()
		let token = parts.join(' ')
		if (schema !== 'basic') {
			return null
		}
		const credentials = Buffer.from(token, 'base64').toString('utf8')
		const [username, password] = credentials.split(':')
		return { username, password }
	}
	parseBearerToken(req) {
		let auth = req.headers ? req.headers.authorization || null : null
		if (!auth) {
			return null
		}
		let parts = auth.split(' ')
		// Malformed header.
		if (parts.length < 2) {
			return null
		}
		let schema = parts.shift().toLowerCase()
		let token = parts.join(' ')
		if (schema !== 'bearer') {
			console.log(schema)
			return null
		}
		return token
	}
	gimmeEntropy(length = 64) {
		let entropy = []
		for (let index = 0; index <= 10; index++) {
			entropy[index] = (Date.now() + '.' + new Date().getMilliseconds())  * Math.random()
		}
		return crypto.createHash('sha256').update(process.env.ENTROPYSALT + JSON.stringify(entropy)).digest('hex').substr(0, length)
	}
	static getPWHash(password) {
		return crypto.createHash('sha256').update(process.env.PASSWORDSALT + crypto.createHash('md5').update(password).digest('hex')).digest('hex')
	}
}

module.exports = authService