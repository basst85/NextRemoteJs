const winston = require('winston');
const colorizer = winston.format.colorize();
const moment = require('moment');

let level = "debug";
const output = "console";

const winstonToLevel = (level) => level === 'warning' ? 'warn' : level;

const levelWithCompensatedLength = {
    'info': 'info ',
    'error': 'error',
    'warn': 'warn ',
    'debug': 'debug',
};

const timestampFormat = () => moment().format("YYYY-MM-DD HH:mm:ss");

// Setup default console logger
const transportsToUse = [
    new winston.transports.Console({
        level,
        silent: !output.includes('console'),
        format: winston.format.combine(
            winston.format.timestamp({format: timestampFormat}),
            winston.format.printf(/* istanbul ignore next */(info) => {
                let {timestamp, level, message} = info;
                level = winstonToLevel(level);
                const prefix = colorizer.colorize(level, `Next:${levelWithCompensatedLength[level]}`);
                return `${prefix} ${timestamp.split('.')[0]}: ${message}`;
            }),
        ),
    }),
];

// Create logger
const logger = winston.createLogger({transports: transportsToUse});

module.exports = logger;