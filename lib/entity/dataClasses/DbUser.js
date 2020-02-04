const sentiData = require('../../core/sentiData')

class DbUser extends sentiData {
	id
	uuid
	userName
	firstName
	lastName
	email
	phone
	aux = null
	internal = null
	orgId = false
	roleId = false
	deleted = 0
	state
	created
	modified

	constructor(data = null, vars = null) {
		super()
		this.assignData(data, vars)
	}
}
module.exports = DbUser