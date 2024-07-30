const fs = require('fs')
const https = require('https')
const express = require('express')
const app = express()
const socket = require('socket.io')
app.use(express.static(__dirname))

// generated with mkcert
// $ mkcert create-ca
// $ mkcert create-cert
const key = fs.readFileSync('./certs/cert.key')
const cert = fs.readFileSync('./certs/cert.crt')

const expressServer = https.createServer({ key, cert }, app)
const io = socket(expressServer)
expressServer.listen(8080)

const offers = [
	// offererUserName
	// offer
	// offerIceCandidates
	// answererUserName
	// answer
	// answererIceCandidates
]
const connectedSockets = [
	//username, socketId
]

io.on('connection', (socket) => {
	const userName = socket.handshake.auth.userName
	const password = socket.handshake.auth.password

	if (password !== 'x') {
		socket.disconnect(true)
		return
	}
	connectedSockets.push({
		socketId: socket.id,
		userName
	})

	//a new client has joined. If there are any offers available,
	if (offers.length) {
		socket.emit('availableOffers', offers)
	}

	socket.on('newOffer', (newOffer) => {
		offers.push({
			offererUserName: userName,
			offer: newOffer,
			offerIceCandidates: [],
			answererUserName: null,
			answer: null,
			answererIceCandidates: []
		})
		socket.broadcast.emit('newOfferAwaiting', offers.at(-1))
	})

	socket.on('newAnswer', (offerObj, ackFunction) => {
		const socketToAnswer = connectedSockets.find((s) => s.userName === offerObj.offererUserName)
		if (!socketToAnswer) {
			console.log('No matching socket')
			return
		}
		const socketIdToAnswer = socketToAnswer.socketId
		const offerToUpdate = offers.find((o) => o.offererUserName === offerObj.offererUserName)
		if (!offerToUpdate) {
			console.log('No OfferToUpdate')
			return
		}
		ackFunction(offerToUpdate.offerIceCandidates)
		offerToUpdate.answer = offerObj.answer
		offerToUpdate.answererUserName = userName
		socket.to(socketIdToAnswer).emit('answerResponse', offerToUpdate)
	})

	socket.on('sendIceCandidateToSignalingServer', (iceCandidateObj) => {
		const { didIOffer, iceUserName, iceCandidate } = iceCandidateObj
		if (didIOffer) {
			const offerInOffers = offers.find((o) => o.offererUserName === iceUserName)
			if (offerInOffers) {
				offerInOffers.offerIceCandidates.push(iceCandidate)
				if (offerInOffers.answererUserName) {
					const socketToSendTo = connectedSockets.find((s) => s.userName === offerInOffers.answererUserName)
					if (socketToSendTo) {
						socket.to(socketToSendTo.socketId).emit('receivedIceCandidateFromServer', iceCandidate)
					} else {
						console.log('Ice candidate received but could not find answerer')
					}
				}
			}
		} else {
			const offerInOffers = offers.find((o) => o.answererUserName === iceUserName)
			const socketToSendTo = connectedSockets.find((s) => s.userName === offerInOffers.offererUserName)
			if (socketToSendTo) {
				socket.to(socketToSendTo.socketId).emit('receivedIceCandidateFromServer', iceCandidate)
			} else {
				console.log('Ice candidate received but could not find offered')
			}
		}
	})
})
