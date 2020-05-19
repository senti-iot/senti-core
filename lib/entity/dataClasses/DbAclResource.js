const sentiData = require('../../core/sentiData')

class DbAclResource extends sentiData {
	id = false
	uuid = null
	name
	type = 0
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
module.exports = DbAclResource