const sentiData = require('../../core/sentiData')

class InternalUser extends sentiData {
	uuid
	userName
	firstName
	lastName
	email
	phone
	aux = null
	internal = null
	org = false
	groups = null
	role = false
	privileges = false
	state
	created
	modified
	lastLoggedIn

	constructor(data = null, vars = null) {
		super()
		this.assignData(data, vars)
	}
}
module.exports = InternalUser