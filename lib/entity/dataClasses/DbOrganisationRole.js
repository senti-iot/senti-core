const sentiData = require('../../core/sentiData')
var moment = require('moment');

class DbOrganisationRole extends sentiData {
	id
	uuid
	aclUUID
	orgId
	roleId
	name
	type
	priority
	aux
	internal
	created
	modified
	
	constructor(data = null, vars = null) {
		super()
		this.assignData(data, vars)
		this.created = moment(this.created).format()
		this.modified = moment(this.modified).format()
	}
}
module.exports = DbOrganisationRole
