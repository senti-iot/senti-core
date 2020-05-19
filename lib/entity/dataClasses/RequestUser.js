const sentiData = require('../../core/sentiData')

class RequestUser extends sentiData {
	uuid
	userName
	password = false
	firstName
	lastName
	email
	phone
	aux = null
	org = false
	groups = null
	role = false
	state
	deleted
	orgId
	roleId

	constructor(data = null, vars = null) {
		super()
		this.assignData(data, vars)
	}
}
module.exports = RequestUser