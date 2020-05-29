const sentiData = require('../../core/sentiData')

class Organisation extends sentiData {
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
	org = false
	created
	modified

	constructor(data = null, vars = null) {
		super()
		this.assignData(data, vars)
	}
}
module.exports = Organisation