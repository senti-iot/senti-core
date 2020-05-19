const sentiData = require('senti-apicore').sentiData

class User extends sentiData {
	uuid
	userName
	firstName
	lastName
	email
	phone
	aux = null
	org = false
	groups = null
	role = false
	state
	created
	modified
	lastLoggedIn

	constructor(data = null, vars = null) {
		super()
		this.assignData(data, vars)
	}
}
module.exports = User