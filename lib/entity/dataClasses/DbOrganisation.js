const sentiData = require('../../core/sentiData')

class DbOrganisation extends sentiData {
	id
	uuid = null
	uuname
	name
	nickname
	address
	zip
	city
	region
	country
	website
	aux = null
	internal = null
	parentOrgId
	deleted
	created
	modified

	constructor(data = null, vars = null) {
		super()
		this.assignData(data, vars)
	}
}
module.exports = DbOrganisation