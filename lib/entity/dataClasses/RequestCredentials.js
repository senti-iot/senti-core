const sentiData = require('../../core/sentiData')

class RequestCredentials extends sentiData {
	id = false
	uuid = false
	oldPassword
	newPassword
	token

	constructor(data = null, vars = null) {
		super()
		this.assignData(data, vars)
	}
}
module.exports = RequestCredentials