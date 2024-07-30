const userName = 'Uniclass-' + Math.floor(Math.random() * 100000)
const password = 'x'
document.querySelector('#user-name').innerHTML = userName

const socket = io.connect('https://192.168.1.118:8080/', {
	auth: {
		userName,
		password
	}
})

const localVideoEl = document.querySelector('#local-video')
const remoteVideoEl = document.querySelector('#remote-video')
const screenShareEl = document.querySelector('#screen-share')

let localStream //a var to hold the local video stream
let remoteStream //a var to hold the remote video stream

let peerConnection //the peerConnection that the two clients use to talk
let didIOffer = false

let peerConfiguration = {
	iceServers: [
		{
			urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302']
		}
	]
}

//when a client initiates a call
const call = async () => {
	await fetchUserMedia()

	//peerConnection is all set with our STUN servers sent over
	await createPeerConnection()

	//create offer time!
	try {
		const offer = await peerConnection.createOffer()
		await peerConnection.setLocalDescription(offer)
		didIOffer = true
		socket.emit('newOffer', offer) //send offer to signalingServer
	} catch (err) {
		console.log(err)
	}
}

const answerOffer = async (offerObj) => {
	await fetchUserMedia()
	await createPeerConnection(offerObj)
	const answer = await peerConnection.createAnswer({}) //just to make the docs happy
	await peerConnection.setLocalDescription(answer) //this is CLIENT2, and CLIENT2 uses the answer as the localDesc
	offerObj.answer = answer
	const offerIceCandidates = await socket.emitWithAck('newAnswer', offerObj)
	offerIceCandidates.forEach((c) => {
		peerConnection.addIceCandidate(c)
	})
}

const addAnswer = async (offerObj) => {
	//addAnswer is called in socketListeners when an answerResponse is emitted.
	//at this point, the offer and answer have been exchanged!
	//now CLIENT1 needs to set the remote
	await peerConnection.setRemoteDescription(offerObj.answer)
}

const fetchUserMedia = () => {
	return new Promise(async (resolve, reject) => {
		try {
			const stream = await navigator.mediaDevices.getUserMedia({
				video: true,
				audio: true
			})

			localVideoEl.srcObject = stream
			localStream = stream

			resolve()
		} catch (err) {
			console.log(err)
			reject()
		}
	})
}

const createPeerConnection = (offerObj) => {
	return new Promise(async (resolve) => {
		// RTCPeerConnection is the thing that creates the connection
		// we can pass a config object, and that config object can contain stun servers
		// which will fetch us ICE candidates
		peerConnection = await new RTCPeerConnection(peerConfiguration)
		remoteStream = new MediaStream()
		remoteVideoEl.srcObject = remoteStream

		localStream.getTracks().forEach((track) => {
			//add local tracks so that they can be sent once the connection is established
			peerConnection.addTrack(track, localStream)
		})

		peerConnection.addEventListener('signalingstatechange', () => {
			console.log(peerConnection.signalingState)
		})

		peerConnection.addEventListener('icecandidate', (e) => {
			if (e.candidate) {
				socket.emit('sendIceCandidateToSignalingServer', {
					iceCandidate: e.candidate,
					iceUserName: userName,
					didIOffer
				})
			}
		})

		peerConnection.addEventListener('track', (e) => {
			e.streams[0].getTracks().forEach((track) => {
				remoteStream.addTrack(track)
			})
		})

		if (offerObj) {
			await peerConnection.setRemoteDescription(offerObj.offer)
		}
		resolve()
	})
}

const addNewIceCandidate = async (iceCandidate) => {
	await peerConnection.addIceCandidate(iceCandidate)
}

const calNetworkHealth = async () => {
	if (!peerConnection) {
		return
	}
	peerConnection.getStats().then((stats) => {
		stats.forEach((report) => {
			if (report.type === 'candidate-pair') {
				if (report.currentRoundTripTime) {
					const t = report.currentRoundTripTime * 1000
					if (t > 100) {
						document.querySelector('#network-health').innerHTML = `
							<p class="text-danger">${'Network Health: ' + t + 'ms'}</p>
						`
					} else if (t > 10) {
						document.querySelector('#network-health').innerHTML = `
							<p class="text-warning">${'Network Health: ' + t + 'ms'}</p>
						`
					} else if (t > 0) {
						document.querySelector('#network-health').innerHTML = `
							<p class="text-success">${'Network Health: ' + t + 'ms'}</p>
						`
					}
				}
			}
		})
	})
}

const shareScreen = async () => {
	if (!peerConnection) {
		return
	}
	const options = {
		video: true,
		audio: false,
		surfaceSwitching: 'include' //include/exclude NOT true/false
	}
	try {
		screenShareEl.srcObject = await navigator.mediaDevices.getDisplayMedia(options)
	} catch (err) {
		console.log(err)
	}
}

setInterval(calNetworkHealth, 3000)

document.querySelector('#call').addEventListener('click', call)
document.querySelector('#share-screen').addEventListener('click', shareScreen)
