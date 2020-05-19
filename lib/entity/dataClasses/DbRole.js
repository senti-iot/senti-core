const sentiData = require('../../core/sentiData')

class DbRole extends sentiData {
	id = false
	uuid = null
	name
	type
	priority
	aux = null
	internal = null
	deleted
	created
	modified

	constructor(data = null, vars = null) {
		super()
		this.assignData(data, vars)
	}
}
module.exports = DbRole