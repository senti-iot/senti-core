const createAPI = require('apisauce').create
const crypto = require('crypto');

class authClient {
	static async getLease(req) {
		let token = authClient.parseBearerToken(req)
		if (token === null) {
			return false
		}
		//console.log(process.env.AUTHCLIENTURL)
		let api = createAPI({
			baseURL: process.env.AUTHCLIENTURL,
			headers: { 
				'Accept': 'application/json', 
				'Content-Type': 'application/json'
			}
		})
		let rs = await api.get('v2/auth/' + token)
		return (rs.ok) ? rs.data : false
	}
	static parseBearerToken(req) {
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
			return null
		}
		return token
	}
	static getPWHash(password) {
		return crypto.createHash('sha256').update(process.env.PASSWORDSALT + crypto.createHash('md5').update(password).digest('hex')).digest('hex')
	}
}
module.exports = authClient