const sentiData = require('../../core/sentiData')

class DbCredentials extends sentiData {
	id = false
	newPassword

	constructor(data = null, vars = null) {
		super()
		this.assignData(data, vars)
	}
}
module.exports = DbCredentials