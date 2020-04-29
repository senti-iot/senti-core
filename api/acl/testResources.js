const express = require('express')
const router = express.Router()

const authClient = require('../../server').authClient
const aclClient = require('../../server').aclClient

router.get('/v2/acl/test/:uuid/:privileges', async (req, res) => {
	let lease = await authClient.getLease(req)
	if (lease === false) {
		res.status(401).json()
		return
	}
	let privileges = req.params.privileges.split('|')
	if (privileges.length < 1) {
		res.status(400).json([])
		return
	}
	let testResource = await aclClient.testResource(lease.uuid, req.params.uuid, privileges)
	if (!testResource.privileges) {
		res.status(404).json()
		return
	}
	res.status(200).json(testResource.privileges)
})
router.post('/v2/acl/test/:privileges', async (req, res) => {
	let lease = await authClient.getLease(req)
	if (lease === false) {
		res.status(401).json()
		return
	}
	let privileges = req.params.privileges.split('|')
	if (privileges.length < 1) {
		res.status(400).json([])
		return
	}
	let queryUUIDs = (req.body.length) ? req.body : []
	if (queryUUIDs.length === 0) {
		res.status(404).json([])
		return
	}
	let testResources = await aclClient.testResources(lease.uuid, queryUUIDs, privileges)
	let result = {}
	testResources.permissions.map((item) => {
		result[item.resourceUUID] = item.privileges
	})
	res.status(200).json(result)
})
module.exports = router