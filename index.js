const logger = require('./lib/logger');
const mqtt = require('mqtt');
const request = require('axios');
const _ = require('underscore');
const express = require('express');
const bodyParser = require('body-parser');
const server = express();
const varClientId = makeId(30);
const config = require('./config.json');
const { time } = require('console');

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
let setopboxStatus;
let stbDevicesCount = 0;
let stations = [];
let uiStatus;
let currentChannel;
let currentChannelId;
let filtered;
let listingsPath;


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
		})
		.catch(function (err) {
			logger.error(`getSession: ${err.message}`);
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
			logger.error(`getApiCall: ${err.message}`);
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
		logger.info('Connected to Ziggo MQTT server');
		
		topic = mqttUsername + '/' + varClientId + '/status';
		payload = {
			"source": varClientId,
			"state": "ONLINE_RUNNING",
			"deviceType": "HGO"
        };
		mqttClient.publish(topic , JSON.stringify(payload));	
		
		mqttClient.subscribe(mqttUsername, function (err) {
			if(err){
				logger.error(`Not connected to MQTT server!: ${err}`);
				return false;
			}
		});

		mqttClient.subscribe(mqttUsername + '/personalizationService', function (err) {
			if(err){
				logger.error(`Cannot subscribe to topic!: ${err}`);				
				return false;
			}				
		});

		mqttClient.subscribe(mqttUsername + '/recordingStatus', function (err) {
			if(err){
				logger.error(`Cannot subscribe to topic!: ${err}`);		
				return false;
			}				
		});

		mqttClient.subscribe(mqttUsername + '/recordingStatus/lastUserAction', function (err) {
			if(err){
				logger.error(`Cannot subscribe to topic!: ${err}`);		
				return false;
			}				
		});
		
		mqttClient.subscribe(mqttUsername + '/+/status', function (err) {
			if(err){
				logger.error(`Cannot subscribe to topic!: ${err}`);		
				return false;
			}				
		});
		
		mqttClient.subscribe(mqttUsername + '/+/localRecordings', function (err) {
			if(err){
				logger.error(`Cannot subscribe to topic!: ${err}`);		
				return false;
			}				
		});		
	
		mqttClient.subscribe(mqttUsername + '/+/localRecordings/capacity', function (err) {
			if(err){
				logger.error(`Cannot subscribe to topic!: ${err}`);		
				return false;
			}				
		});	
		
		mqttClient.subscribe(mqttUsername + '/watchlistService', function (err) {
			if(err){
				logger.error(`Cannot subscribe to topic!: ${err}`);		
				return false;
			}				
		});	
		
		mqttClient.on('message', function (topic, payload) {
			let payloadValue = JSON.parse(payload);
			
			logger.debug(`topic: '${topic}', payload: '${payload}`);
			
			if(payloadValue.deviceType){
                logger.debug("Received Message with deviceType")
				if(payloadValue.deviceType == 'STB'){
                    logger.debug("And it is for an STB")
					stbDevicesCount++;
					setopboxId = payloadValue.source;
					setopboxState = payloadValue.state;
                    logger.debug("State of box:" + setopboxState)
					setopboxStatus = payloadValue;

					if(stbDevicesCount == 1){
						getUiStatus();
                        logger.debug("First STB, so get uistatus")
					}
					
					mqttClient.subscribe(mqttUsername + '/' + varClientId, function (err) {
						if(err){
							logger.error(`Cannot subscribe to topic!: ${err}`);		
							return false;
						}
					});
					
					mqttClient.subscribe(mqttUsername + '/' + setopboxId, function (err) {
						if(err){
							logger.error(`Cannot subscribe to topic!: ${err}`);		
							return false;
						}
					});
					
					mqttClient.subscribe(mqttUsername + '/'+ setopboxId +'/status', function (err) {
						if(err){
							logger.error(`Cannot subscribe to topic!: ${err}`);		
							return false;
						}
					});
				}
			}
						
			if(payloadValue.status){
				if(payloadValue.status.uiStatus === "mainUI"){
					if(payloadValue.status.playerState.sourceType === "linear"){
                        logger.debug("source = 'linear'")
						filtered = _.where(stations, {serviceId: payloadValue.status.playerState.source.channelId});
						uiStatus = payloadValue;
						currentChannelId = uiStatus.status.playerState.source.channelId;
						currentChannel = filtered[0].title;
						LocationId = sessionJson.LocationId;
						crid = payloadValue.status.playerState.source.eventId;
						listingsPath = listingsUrl + crid ;
						getCurrentProgram(listingsPath,LocationId);
																						
						//console.log('Current channel:', filtered[0].title);
								
					}
					else if(payloadValue.status.playerState.sourceType === "replay"){
                        logger.debug("source = 'replay'")	
						uiStatus = payloadValue;
						
					}
					else if(payloadValue.status.playerState.sourceType === "VOD"){
                        logger.debug("source = 'VOD'")	
						uiStatus = payloadValue;
					}	
					else if(payloadValue.status.playerState.sourceType === "nDVR"){
                        logger.debug("source = 'nDVR'")	
						uiStatus = payloadValue;
					}		
					else if(payloadValue.status.playerState.sourceType === "reviewbuffer"){
                        logger.debug("source = 'reviewbuffer'")	
						//pause
						uiStatus = payloadValue;
					}						
				}
				else if(payloadValue.status.uiStatus === "apps"){
                    logger.debug("source = 'apps'")	
					currentChannel = payloadValue.status.appsState.appName ;
					//console.log(payloadValue.status.appsState.appName );
				}	
                else logger.debug("Unknown source")			
				
			}

			
		});
		
		mqttClient.on('error', function(err) {
			logger.error(`Not connected to MQTT server!: ${err}`);
			mqttClient.end();
			return false;
		});

		mqttClient.on('close', function () {
			logger.debug('Connection closed');
			mqttClient.end();
			return false;
		});
	});
};

function switchChannel(channelId) {
	logger.debug(`Switch to: ${channelId}`);
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
	logger.debug(`Send key: ${key}`);
	
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

async function sendAction(action) {
    switch(action){
        case 'Radio':
            sendActionRadio(action);
            logger.info(`Sent Radio action: ${action}`);
            break;
        case 'PowerOn':
            sendActionPowerOn("ONLINE_RUNNING");
            logger.info(`Sent power action: ${action}`);
            break;
        case 'PowerOff':
            sendActionPowerOn("ONLINE_STANDBY");
            logger.info(`Sent power action: ${action}`);
            break;      
    }
	
};
function sendActionPowerOn(DesiredState) {
    if(setopboxState){
        if (setopboxState != DesiredState) {
            sendKey("Power");
            setopboxState = DesiredState;  // Should be set by response from MQTT, just to be sure
            logger.info("Sent Power command");
        }
        else
            logger.info("Box already in " + DesiredState);
        
    }
}


async function sendActionRadio(action) {
    // bit of a tricky code to set STB into radio mode, last channel used.
    // It does so by feeding a number of button-presses; fails sometimes, works 90% of the time
    sendKey("TV")
    await new Promise(r => setTimeout(r, 900));
    sendKey("Escape")
    await new Promise(r => setTimeout(r, 900));
    sendKey("MediaTopMenu")
    await new Promise(r => setTimeout(r, 1000));
    sendKey("ArrowDown")
	await new Promise(r => setTimeout(r, 1100));
	sendKey("ArrowDown")
	await new Promise(r => setTimeout(r, 1100));
	sendKey("ArrowDown")
	await new Promise(r => setTimeout(r, 1100));
	sendKey("ArrowDown")
	await new Promise(r => setTimeout(r, 1100));
	sendKey("Enter")
	await new Promise(r => setTimeout(r, 1100));
	sendKey("Enter")
}

function playRecording(recordingId) {
	logger.debug(`Play Recording: ${recordingId}`);
	
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
	logger.debug(`Get UI status`);
	
	topic = mqttUsername + '/' + setopboxId;
	payload = {
		"id": makeId(8),
		"type": "CPE.getUiStatus",
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
		const Recordings = await getApiCall(recordingsUrl,sessionJson.oespToken, sessionJson.customer.householdId);

		mqttUsername = sessionJson.customer.householdId;
		mqttPassword = jwtTokenJson.token;	

		startMqttClient();
		
		server.use(bodyParser.json());
		server.use(bodyParser.urlencoded({
			extended: true
		})); 

		server.listen(config.webPort, () => {
			logger.info(`Webserver running on port: ${config.webPort}`);
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
				case 'sendAction':
					sendAction(req.body.theAction);
					break;						
				case 'getUiStatus':
					getUiStatus();
					break;											
				default:
					res.json({"Status": "Error"});
                    return;
					break;
			}
			res.json({"Status": "Ok"});
		});

		server.post("/api/disconnect", (req, res, next) => {
			logger.debug('MQTT Connection closing');
			mqttClient.end();
			res.json({"Status": "Ok"});
		});

		server.post("/api/reconnect", (req, res, next) => {
			logger.debug('MQTT Reconnecting');
			startMqttClient();
			res.json({"Status": "Ok"});
		});

		server.get("/api/mqtt", (req, res, next) => {
			res.json({ "username": mqttUsername, "password": mqttPassword });
			logger.debug(`Get MQTT credentials`);
		});	


		server.get("/api/setopboxStatus", (req, res, next) => {
			res.json(setopboxStatus);
			logger.debug(`Get setopboxStatus`);
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
			logger.debug(`Get stations`);
		});

		server.get("/api/currentchannel", (req, res, next) => {
			res.json(currentChannel);
			logger.debug(`Get current channel`);
		});	

		server.get("/api/currentprogram", (req, res, next) => {		
			if(currentProgram){
				res.json(currentProgram);			
			}			
			logger.debug(`Get current program`);
		});	
		
		server.get("/api/uistatus", (req, res, next) => {
			res.json(uiStatus);
			logger.debug(`Get uiStatus`);
		});		
	
		server.get("/api/session", (req, res, next) => {
			res.json(sessionJson);
			logger.debug(`Get session`);
		});			
			
		server.get("/api/recordings", (req, res, next) => {
			res.json(Recordings);
			logger.debug(`Get recordings`);
		});			
				
	});
