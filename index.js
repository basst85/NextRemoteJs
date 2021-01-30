const mqtt = require('mqtt');
const request = require('axios');
const _ = require('underscore');
const express = require('express');
const bodyParser = require('body-parser');
const server = express();
const varClientId = makeId(30);
const config = require('./config.json');

const baseUrl = 'https://web-api-prod-obo.horizon.tv/oesp/v3/NL/nld/web';
const sessionUrl = baseUrl + '/session';
const jwtUrl = baseUrl + '/tokens/jwt';
const channelsUrl = baseUrl + '/channels';
const listingsUrl = baseUrl + '/listings/';
const recordingsUrl = baseUrl + '/networkdvrrecordings/';
const authorizationUrl = baseUrl + '/authorization/';
const profileUrl = baseUrl + '/settopboxes/profile';

const mqttUrl = 'wss://obomsg.prod.nl.horizon.tv:443/mqtt';


let mqttClient = {};

// Set Ziggo username and password
const ziggoUsername = config.ziggoUsername;
const ziggoPassword = config.ziggoPassword;

let mqttUsername;
let mqttPassword;
let setopboxId;
let setopboxState;
let stbDevicesCount = 0;
let stations = [];
let uiStatus;
let currentChannel;
let currentChannelId;
let filtered;
let listingsPath;
let box;





const getChannels = request({
	method: 'GET',
    url: channelsUrl,
    json: true
}).then((response) => {
	if (response.status === 200) {
		channels = response.data.channels;
		channels.forEach(function (c) {
			c.stationSchedules.forEach(function (s) {
				stations.push(s.station);
			});
		});
	}	
	
});


const sessionRequestOptions = {
    method: 'POST',
    url: sessionUrl,
    data: {
		username: ziggoUsername,
		password: ziggoPassword
    },
    json: true
};

const getSession = async () => {
	await request(sessionRequestOptions)
		.then(json => {
			sessionJson = json.data;
			//console.log(sessionJson);
		})
		.catch(function (err) {
			console.log('getSession: ', err.message);
			return false;
		});
		
		return sessionJson;
};


const getApiCall = async (url,oespToken, householdId) => {
	const RequestOptions = {
		method: 'GET',
		url: url,
		headers: {
			'X-OESP-Token': oespToken,
			'X-OESP-Username': ziggoUsername
		},
		json: true
	};
	
	await request(RequestOptions)
		.then(json => {
			if (json.status === 200) {
				apiJson = json.data;				
			}
			else if (json.status === 403) {
				//Api call resultcode was 403. Refreshing token en trying again...		
			}
			else{
				//failed
			}
		})
		.catch(function (err) {
			console.log('getApiCall: ', err.message);
			return false;
		});
		
		return apiJson;
};


const startMqttClient = async () => {
	mqttClient = mqtt.connect(mqttUrl, {
		connectTimeout: 10*1000, //10 seconds
		clientId: varClientId,
		username: mqttUsername,
		password: mqttPassword
	});
	
	mqttClient.on('connect', function () {
		
		topic = mqttUsername + '/' + varClientId + '/status';
		payload = {
			"source": varClientId,
			"state": "ONLINE_RUNNING",
			"deviceType": "HGO"
        };
		mqttClient.publish(topic , JSON.stringify(payload));	
		//mqttClient.publish(mqttUsername + '/' + varClientId + '/status', '{"source":"' + varClientId + '","state":"ONLINE_RUNNING","deviceType":"HGO"}');
		
		mqttClient.subscribe(mqttUsername, function (err) {
			if(err){
				console.log(err);
				return false;
			}
		});
		
		mqttClient.subscribe(mqttUsername + '/+/status', function (err) {
			if(err){
				console.log(err);
				return false;
			}				
		});
		
		mqttClient.subscribe(mqttUsername + '/+/localRecordings', function (err) {
			if(err){
				console.log(err);
				return false;
			}				
		});		
		
		mqttClient.on('message', function (topic, payload) {
			let payloadValue = JSON.parse(payload);
			
			console.log(payloadValue);
			if(payloadValue.deviceType){
				if(payloadValue.deviceType == 'STB'){
					stbDevicesCount++;
					setopboxId = payloadValue.source;
					setopboxState = payloadValue.state;
					setopboxStatus = payloadValue;

					if(stbDevicesCount == 1){
						getUiStatus();
					}
					
					mqttClient.subscribe(mqttUsername + '/' + varClientId, function (err) {
						if(err){
							console.log(err);
							return false;
						}
					});
					
					mqttClient.subscribe(mqttUsername + '/' + setopboxId, function (err) {
						if(err){
							console.log(err);
							return false;
						}
					});
					
					mqttClient.subscribe(mqttUsername + '/'+ setopboxId +'/status', function (err) {
						if(err){
							console.log(err);
							return false;
						}
					});
				}
			}
						
			if(payloadValue.status){
				
				if(payloadValue.status.uiStatus === "mainUI"){
					//console.log(payloadValue.status.playerState);
					if(payloadValue.status.playerState.sourceType === "linear"){
						filtered = _.where(stations, {serviceId: payloadValue.status.playerState.source.channelId});
						uiStatus = payloadValue;
						currentChannelId = uiStatus.status.playerState.source.channelId;
						currentChannel = filtered[0].title;
						LocationId = sessionJson.LocationId;
						crid = payloadValue.status.playerState.source.eventId;
						listingsPath = listingsUrl + crid ;
						getCurrentProgram(listingsPath,LocationId);
								
		
						box = {
							sourceType : payloadValue.status.playerState.sourceType,
							stateSource : payloadValue.status.playerState.source,
							speed : payloadValue.status.playerState.speed,
							currentChannelId : uiStatus.status.playerState.source.channelId,
	
						}
												
						console.log('Current channel:', filtered[0].title);
								
					}
					else if(payloadValue.status.playerState.sourceType === "replay"){
						
						box = {
							sourceType : payloadValue.status.playerState.sourceType,
							eventId  : payloadValue.status.playerState.sourceType.eventId,
							currentChannel : filtered[0].title
						}						
						uiStatus = payloadValue;
						
					}
					else if(payloadValue.status.playerState.sourceType === "VOD"){
						uiStatus = payloadValue;
					}	
					else if(payloadValue.status.playerState.sourceType === "nDVR"){
						uiStatus = payloadValue;
					}		
					else if(payloadValue.status.playerState.sourceType === "reviewbuffer"){
						//pause
						uiStatus = payloadValue;
					}						
				}
				else if(payloadValue.status.uiStatus === "apps"){
					currentChannel = payloadValue.status.appsState.appName ;
					console.log(payloadValue.status.appsState.appName );
				}				
				
			}

			
		});
		
		mqttClient.on('error', function(err) {
			console.log(err);
			mqttClient.end();
			return false;
		});

		mqttClient.on('close', function () {
			console.log('Connection closed');
			mqttClient.end();
			return false;
		});
	});
};

function switchChannel(channelId) {
	console.log('Switch to', channelId);
	topic = mqttUsername + '/' + setopboxId;
	payload = {
		"id": makeId(8),
		"type":"CPE.pushToTV",
		"source": {
			"clientId": varClientId,
			"friendlyDeviceName": config.friendlyDeviceName			
		},
		"status": {
			"sourceType":"linear",
			"source": {
				"channelId": channelId,				
			},
		"relativePosition":0,
		"speed":1		
		}
	}	
	mqttClient.publish(topic , JSON.stringify(payload));	
};

function sendKey(key) {
	console.log('Send key: ' + key);
	topic = mqttUsername + '/' + setopboxId;
	payload = {
		"id": makeId(8),
		"type": "CPE.KeyEvent",
		"source": varClientId,
		"status": { 
			"w3cKey": key,
			"eventType":"keyDownUp"
		}
	};
	mqttClient.publish(topic , JSON.stringify(payload));	
};

function playRecording(recordingId) {
	console.log('Play Recording', recordingId);
	topic = mqttUsername + '/' + setopboxId;
	payload = {
		"id": makeId(8),
		"type":"CPE.pushToTV",
		"source": {
			"clientId": varClientId,
			"friendlyDeviceName": config.friendlyDeviceName			
		},
		"status": {
			"sourceType":"nDVR",
			"source": {
				"recordingId": recordingId,				
			},
		"relativePosition":0,
		"speed":1		
		}
	}	
	mqttClient.publish(topic , JSON.stringify(payload));	
};

function getUiStatus() {
	console.log('Get UI status');
	topic = mqttUsername + '/' + setopboxId;
	payload = {
		"id": makeId(8),
		"type":"CPE.getUiStatus",
		"source": varClientId
	}
	mqttClient.publish(topic, JSON.stringify(payload))
};

function makeId(length) {
	let result  = '';
	let characters  = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	let charactersLength = characters.length;
	for ( let i = 0; i < length; i++ ) {
		result += characters.charAt(Math.floor(Math.random() * charactersLength));
	}
	return result;
};

function getCurrentProgram(url,LocationId) {
	request({	
		method: 'GET',
		url: url,
		param: {
			byLocationId: LocationId
		},	
		json: true
	}).then((response) => {
		if (response.status === 200) {
			currentProgram = response.data;

			return (currentProgram);
			};
		})	
		
	};
	

getSession()
    .then(async sessionJson => {		
		const jwtTokenJson = await getApiCall(jwtUrl,sessionJson.oespToken, sessionJson.customer.householdId);
		const Recordings = await getApiCall(profileUrl,sessionJson.oespToken, sessionJson.customer.householdId);
		//console.log(Recordings);

		mqttUsername = sessionJson.customer.householdId;
		mqttPassword = jwtTokenJson.token;	

		startMqttClient();
		
		server.use(bodyParser.json());
		server.use(bodyParser.urlencoded({
			extended: true
		})); 

		server.listen(config.webPort, () => {
			console.log("Server running on port: " + config.webPort);
		});
		
		server.get("/", (req, res, next) => {
			res.sendFile(__dirname + '/index.html');
		});

		server.post("/api", (req, res, next) => {
			switch(req.body.action){
				case 'pushChannel':
					switchChannel(req.body.channel);
					break;
				case 'sendKey':
					sendKey(req.body.key);
					break;						
				case 'getUiStatus':
					getUiStatus();
					break;											
				default:
					res.json({"Status": "Error"});
					break;
			}
			res.json({"Status": "Ok"});
		});

		server.get("/api/setopboxStatus", (req, res, next) => {
			res.json(setopboxStatus);
			console.log('Get setopboxStatus');
		});	

		server.get("/api/status", (req, res, next) => {
			if(setopboxState){
				res.json({"Status": "Ok", "setopboxState": setopboxState, "currentChannel": currentChannel, "currentChannelId": currentChannelId, "rawUiStatus": {uiStatus}});
			}else{
				res.json({"Status": "Error"});
			}
		});
		
		server.get("/api/stations", (req, res, next) => {
			res.json(stations);
			console.log('Get stations');
		});

		server.get("/api/currentchannel", (req, res, next) => {
			res.json(currentChannel);
			console.log('Get current channel');
		});	

		server.get("/api/currentprogram", (req, res, next) => {		
			if(currentProgram){
				res.json(currentProgram);			
			}			
			console.log('Get current program');
		});	
		
		server.get("/api/uistatus", (req, res, next) => {
			res.json(box);
			console.log('Get uiStatus');
		});		
	
		server.get("/api/session", (req, res, next) => {
			res.json(sessionJson);
			console.log('Get session');
		});			
			
		server.get("/api/recordings", (req, res, next) => {
			res.json(Recordings);
			console.log('Get recordings');
		});			
				
	});
