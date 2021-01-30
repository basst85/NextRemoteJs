const boxStates = {
    ONLINE_RUNNING: 'ONLINE_RUNNING',
    ONLINE_STANDBY: 'ONLINE_STANDBY',
    UNKNOWN: 'UNKNOWN',
};


const boxPlayStates = {
	BOX_PLAY_STATE_CHANNEL: "linear",
	BOX_PLAY_STATE_REPLAY: "replay",
	BOX_PLAY_STATE_DVR: "nDVR",
	BOX_PLAY_STATE_BUFFER: "reviewbuffer",
	BOX_PLAY_STATE_APP: "app",
	BOX_PLAY_STATE_VOD: "VOD",
};


const mediaKeys = {
	MEDIA_KEY_POWER: "Power",	
	MEDIA_KEY_GUIDE: "Guide",	
	MEDIA_KEY_MEDIATOPMENU: "MediaTopMenu",
	MEDIA_KEY_TV: "TV",	
	
	MEDIA_KEY_ARROW_UP: "ArrowUp",
	MEDIA_KEY_ARROW_DOWN: "ArrowDown",
	MEDIA_KEY_ENTER: "Enter",	
	MEDIA_KEY_ARROW_LEFT: "ArrowLeft",
	MEDIA_KEY_ARROW_RIGHT: "ArrowRight",

	MEDIA_KEY_ESCAPE: "Escape",
	MEDIA_KEY_CONTEXT_MENU: "ContextMenu",	
	
	MEDIA_KEY_HELP: "Help",
	MEDIA_KEY_INFO: "Info",

	MEDIA_KEY_RECORD: "MediaRecord",
	MEDIA_KEY_CHANNEL_UP: "ChannelUp",
	MEDIA_KEY_CHANNEL_DOWN: "ChannelDown",

	MEDIA_KEY_FAST_FORWARD: "MediaFastForward",	
	MEDIA_KEY_PAUSE: "MediaPause",
	MEDIA_KEY_PLAY_PAUSE: "MediaPlayPause",
	MEDIA_KEY_STOP: "MediaStop",
	MEDIA_KEY_REWIND: "MediaRewind",

};

module.exports = {
    boxStates,
	boxPlayStates,
	mediaKeys,
};