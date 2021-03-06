const sentiData = require('../../core/sentiData')

class RequestOrganisation extends sentiData {
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
	org = null
	parentOrgId
	deleted
	created
	modified

	constructor(data = null, vars = null) {
		super()
		this.assignData(data, vars)
	}
}
module.exports = RequestOrganisation