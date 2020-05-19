const sentiData = require('../../core/sentiData')

class Role extends sentiData {
	uuid = null
	name
	type
	priority
	aux = null
	created
	modified

	constructor(data = null, vars = null) {
		super()
		this.assignData(data, vars)
	}
}
module.exports = Role