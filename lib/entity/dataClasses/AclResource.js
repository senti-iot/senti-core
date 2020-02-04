const sentiData = require('../../core/sentiData')

class AclResource extends sentiData {
	uuid = null
	type

	constructor(data = null, vars = null) {
		super()
		this.assignData(data, vars)
	}
}
module.exports = AclResource