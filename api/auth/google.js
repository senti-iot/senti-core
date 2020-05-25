const express = require('express')
const router = express.Router()
const authService = require('../../lib/authentication/authService')
const createAPI = require('apisauce').create

// Andrei: GG, of course it won't work with GET instead of POST
// router.get('/v2/auth/google', async (req, res) => {
router.post('/v2/auth/google', async (req, res) => {
	let auth = new authService()
	let googleAPI = createAPI({
		baseURL: 'https://oauth2.googleapis.com/',
		headers: {
			'Accept': 'application/json',
			'Content-Type': 'application/json',
			'User-Agent': 'Senti.io v1'
		}
	})
	googleAPI.get('tokeninfo', { 'id_token': req.body.id_token }).then(rs => {
		console.log('Google auth Response:', rs.status, rs.data)
		if (rs.data.aud && rs.data.aud == process.env.GOOLEAUTHCLIENTID) {
			let lease = auth.emailLogin(rs.data.email)
			if (lease !== false) {
				res.status(200).json(lease)
			} else {
				res.status(404).json(lease)
			}
		} else {
			res.status(400).json()
		}
	})
})
module.exports = router