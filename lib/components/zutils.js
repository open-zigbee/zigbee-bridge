const _ = require('busyman');
const proving = require('proving');
const zclId = require('zigbee-bridge-definitions');

function toHexString(val, type) {
    let string;
    let niplen = parseInt(type.slice(4)) / 4;

    string = val.toString(16);

    while (string.length !== niplen) {
        string = '0' + string;
    }

    return '0x' + string;
}

function toLongAddrString(addr) {
    let longAddr;

    if (_.isString(addr)) {
        longAddr = (_.startsWith(addr, '0x') || _.startsWith(addr, '0X')) ? addr.slice(2, addr.length).toLowerCase() : addr.toLowerCase();
    } else if (_.isNumber(addr)) {
        longAddr = addr.toString(16);
    } else {
        throw new TypeError('Address can only be a number or a string.');
    }

    for (let i = longAddr.length; i < 16; i++) {
        longAddr = '0' + longAddr;
    }

    return '0x' + longAddr;
}

function dotPath(path) {
    proving.string(path, 'Input path should be a string.');

    // tranform slash notation into dot notation
    path = path.replace(/\//g, '.');

    // if the first char of topic is '.', take it off
    if (path[0] === '.') {
        path = path.slice(1);
    }

    // if the last char of topic is '.', take it off
    if (path[path.length-1] === '.') {
        path = path.slice(0, path.length - 1);
    }

    return path;
}

function buildPathValuePairs(rootPath, obj) {
    let result = {};
    rootPath = dotPath(rootPath);

    if (obj && typeof obj === 'object') {
        if (rootPath !== undefined && rootPath !== '' && rootPath !== '.' && rootPath !== '/') {
            rootPath = rootPath + '.';
        }

        for (let key in obj) {
            if (obj.hasOwnProperty(key)) {
                let n = obj[key];

                if (n && typeof n === 'object') {
                    result = Object.assign(result, buildPathValuePairs(rootPath + key, n));
                } else {
                    result[rootPath + key] = n;
                }
            }
        }
    } else {
        result[rootPath] = obj;
    }

    return result;
}

function objectDiff(oldObj, newObj) {
    let pvp = buildPathValuePairs('/', newObj);
    let diff = {};

    _.forEach(pvp, (val, path) => {
        if (!_.has(oldObj, path) || _.get(oldObj, path) !== val) {
            _.set(diff, path, val);
        }
    });

    return diff;
}

function parseClusterAttr(cId, attrIdOrDef) {
    let id;
    let type;

    if (_.isObject(attrIdOrDef)) {
        id = attrIdOrDef.id;
        type = zclId.dataType(attrIdOrDef.type).value;
    } else if (cId) {
        const attr = zclId.attr(cId, attrIdOrDef);

        id = attr
            ? attr.value
            : attrIdOrDef;

        type = zclId.attrType(cId, attrIdOrDef).value;
    } else {
        throw new TypeError('Cluster id is required if attrubute argument is not an object');
    }

    return {
        id,
        type,
    };
}

module.exports = {
    dotPath,
    objectDiff,
    toHexString,
    toLongAddrString,
    buildPathValuePairs,
    parseClusterAttr,
};