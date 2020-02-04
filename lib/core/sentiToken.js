const crypto = require('crypto');
const uuidv4 = require('uuid/v4');
var moment = require('moment');

var mysqlConn = require('../../mysql/mysql_handler')

const UserToken = require('./dataClasses/UserToken')

class sentiToken {
	static lease = 1
	static confirmUser = 2
	static forgotPassword = 3


	async getTokenById(id) {
		let select = `SELECT id, token FROM token WHERE id = ?;`
		let rs = await mysqlConn.query(select, [id])
		if (rs[0].length === 1) {
			return rs[0][0]
		}
		return false
	}
	async createToken() {
		let insert = `INSERT INTO token (token) VALUES(?);`
		let rs = await mysqlConn.query(insert, [this.generateToken()])
		if (rs[0].affectedRows === 1) {
			return await this.getTokenById(rs[0].insertId)
		}
		return false
	}
	async getUserTokenById(id) {
		let select = `SELECT UT.id, T.token, U.uuid, UT.userId, UT.type, UT.created, UT.expires FROM userToken UT INNER JOIN token T ON T.id = UT.tokenId INNER JOIN user U ON UT.userId = U.id WHERE UT.id = ?;`
		let rs = await mysqlConn.query(select, [id])
		if (rs[0].length === 1) {
			console.log(new UserToken(rs[0][0]))
			return new UserToken(rs[0][0])
		}
		return false
	}
	async getUserTokenByToken(token) {
		let select = `SELECT UT.id FROM userToken UT INNER JOIN token T ON T.id = UT.tokenId WHERE T.token = ?;`
		let rs = await mysqlConn.query(select, [token])
		if (rs[0].length === 1) {
			return this.getUserTokenById(rs[0][0].id)
		}
		return false
	}
	async createUserToken(userId = false, type = sentiToken.lease, ttl = { days: 30 }) {
		if (userId === false) {
			return false
		}
		let created = moment().format()
		let expires
		if (this.validTTL(Object.keys(ttl)[0])) {
			let ttlKey = Object.keys(ttl)[0]
			let ttlValue = ttl[ttlKey]
			expires = moment().add(ttlValue, ttlKey).format()
		} else {
			expires = moment().format()
		}
		let token = await this.createToken()

		let insert = `INSERT INTO userToken (tokenId, userId, type, created, expires) VALUES(?, ?, ?, ?, ?);`
		let rs = await mysqlConn.query(insert, [token.id, userId, type, created, expires])
		if (rs[0].affectedRows === 1) {
			return await this.getUserTokenById(rs[0].insertId)
		}
		return false
	}
	async renewUserTokenById(id = false, ttl = { days: 30 }) {
		if (id === false) {
			return false
		}
		let expires
		if (this.validTTL(Object.keys(ttl)[0])) {
			let ttlKey = Object.keys(ttl)[0]
			let ttlValue = ttl[ttlKey]
			expires = moment().add(ttlValue, ttlKey).format()
		} else {
			expires = moment().format()
		}
		let update = `UPDATE userToken SET expires = ? WHERE id = ?;`
		let rs = await mysqlConn.query(update, [expires, id])
		if (rs[0].affectedRows === 1) {
			return await this.getUserTokenById(id)
		}
		return false
	}
	async renewUserToken(token = false, ttl = { days: 30 }) {
		if (token === false) {
			return false
		}
		let select = `SELECT UT.id FROM userToken UT INNER JOIN token T ON T.id = UT.tokenId WHERE T.token = ?;`
		let rs = await mysqlConn.query(select, [token])
		if (rs[0].length === 1) {
			return this.renewUserTokenById(rs[0][0].id)
		}
		return false
	}
	async expireUserToken(id = false) {
		if (id === false) {
			return false
		}
		let expires = '1999-12-31 23:59:59'
		let update = `UPDATE userToken SET expires = ? WHERE id = ?;`
		let rs = await mysqlConn.query(update, [expires, id])
		if (rs[0].affectedRows === 1) {
			return true
		}
		return false
	}
	validTTL(key) {
		let approvedKeys = ["years", "y", "quarters", "Q", "months", "M", "weeks", "w", "days", "d", "hours", "h", "minutes", "m", "seconds", "s", "milliseconds", "ms"]
		return (approvedKeys.filter(item => { return item === key })[0] !== undefined) ? true : false
	}
	generateToken(length = 64) {
		return crypto.createHash('sha256').update(process.env.ENTROPYSALT + uuidv4()).digest('hex').substr(0, length)
	}
}
module.exports = sentiToken