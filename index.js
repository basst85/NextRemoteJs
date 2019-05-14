const mqtt = require('mqtt');
const request = require('request-promise');
const _ = require('underscore');
const express = require('express');
const bodyParser = require('body-parser');
const server = express();
const varClientId = makeId(30);

const sessionUrl = 'https://web-api-prod-obo.horizon.tv/oesp/v3/NL/nld/web/session';
const jwtUrl = 'https://web-api-prod-obo.horizon.tv/oesp/v3/NL/nld/web/tokens/jwt';
const channelsUrl = 'https://web-api-prod-obo.horizon.tv/oesp/v3/NL/nld/web/channels';
const mqttUrl = 'wss://obomsg.prod.nl.horizon.tv:443/mqtt';

let mqttClient = {};

// Set Ziggo username and password
const ziggoUsername = "Your username";
const ziggoPassword = "Your password";

let mqttUsername;
let mqttPassword;
let setopboxId;
let setopboxState;
let stations = [];
let uiStatus;
let currentChannel;
let currentChannelId;

const sessionRequestOptions = {
    method: 'POST',
    uri: sessionUrl,
    body: {
		username: ziggoUsername,
		password: ziggoPassword
    },
    json: true
};

const getChannels = request({
    url: channelsUrl,
    json: true
}, function (error, response, body) {
	if (!error && response.statusCode === 200) {
		channels = body.channels;
		channels.forEach(function (c) {
			c.stationSchedules.forEach(function (s) {
				stations.push(s.station);
			});
		});
	}
});

const getSession = async () => {
	await request(sessionRequestOptions)
		.then(json => {
			sessionJson = json;
		})
		.catch(function (err) {
			console.log('getSession: ', err.message);
			return false;
		});
		
		return sessionJson;
};

const getJwtToken = async (oespToken, householdId) => {
	const jwtRequestOptions = {
		method: 'GET',
		uri: jwtUrl,
		headers: {
			'X-OESP-Token': oespToken,
			'X-OESP-Username': ziggoUsername
		},
		json: true
	};
	
	await request(jwtRequestOptions)
		.then(json => {
			jwtJson = json;
		})
		.catch(function (err) {
			console.log('getJwtToken: ', err.message);
			return false;
		});
		
		return jwtJson;
};

const startMqttClient = async () => {
	mqttClient = mqtt.connect(mqttUrl, {
		connectTimeout: 10*1000, //10 seconds
		clientId: varClientId,
		username: mqttUsername,
		password: mqttPassword
	});
	
	mqttClient.on('connect', function () {
		mqttClient.subscribe(mqttUsername, function (err) {
			if(err){
				console.log(err);
				return false;
			}
		});
		
		mqttClient.subscribe(mqttUsername +'/+/status', function (err) {
			if(err){
				console.log(err);
				return false;
			}
		});

		mqttClient.on('message', function (topic, payload) {
			let payloadValue = JSON.parse(payload);
			
			if(payloadValue.deviceType){
				if(payloadValue.deviceType == 'STB'){
					setopboxId = payloadValue.source;
					setopboxState = payloadValue.state;

					getUiStatus();
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
				console.log(payloadValue.status);
				if(payloadValue.status.playerState){
					let filtered = _.where(stations, {serviceId: payloadValue.status.playerState.source.channelId});
					currentChannelId = uiStatus.status.playerState.source.channelId;
					currentChannel = filtered[0].title;
					uiStatus = payloadValue;
					console.log('Current channel:', filtered[0].title);
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

function switchChannel(channel) {
	console.log('Switch to', channel);
	mqttClient.publish(mqttUsername + '/' + setopboxId, '{"id":"' + makeId(8) + '","type":"CPE.pushToTV","source":{"clientId":"' + varClientId + '","friendlyDeviceName":"NodeJs"},"status":{"sourceType":"linear","source":{"channelId":"' + channel + '"},"relativePosition":0,"speed":1}}')
};

function powerKey() {
	console.log('Power on/off');
	mqttClient.publish(mqttUsername + '/' + setopboxId, '{"id":"' + makeId(8) + '","type":"CPE.KeyEvent","source":"' + varClientId + '","status":{"w3cKey":"Power","eventType":"keyDownUp"}}')
};

function escapeKey() {
	console.log('Send escape-key');
	mqttClient.publish(mqttUsername + '/' + setopboxId, '{"id":"' + makeId(8) + '","type":"CPE.KeyEvent","source":"' + varClientId + '","status":{"w3cKey":"Escape","eventType":"keyDownUp"}}')
};

function getUiStatus() {
	console.log('Get UI status');
	mqttClient.publish(mqttUsername + '/' + setopboxId, '{"id":"' + makeId(8) + '","type":"CPE.getUiStatus","source":"' + varClientId + '"}')
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

getSession()
    .then(async sessionJson => {
		const jwtTokenJson = await getJwtToken(sessionJson.oespToken, sessionJson.customer.householdId);

		mqttUsername = sessionJson.customer.householdId;
		mqttPassword = jwtTokenJson.token;	

		startMqttClient();
		
		server.use(bodyParser.json());
		server.use(bodyParser.urlencoded({
			extended: true
		})); 

		server.listen(8080, () => {
			console.log("Server running on port 8080");
		});
		
		server.get("/", (req, res, next) => {
			res.sendFile(__dirname + '/index.html');
		});

		server.post("/api", (req, res, next) => {
			switch(req.body.action){
				case 'pushChannel':
					switchChannel(req.body.channel);
					break;
				case 'powerKey':
					powerKey();
					break;
				case 'escapeKey':
					escapeKey();
					break;
				default:
					res.json({"Status": "Error"});
					break;
			}
			res.json({"Status": "Ok"});
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
		
	});